"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { appConfigSchema, saveAppConfig, type AppConfigInput } from "@/lib/app-config";
import { adminClient } from "@/lib/supabase/admin";
import { fulfillOrder } from "@/lib/orders";
import { connectTelegramBot, telegramEnabled, telegramStatus } from "@/lib/payments/telegram";
import { nowpaymentsEnabled, nowpaymentsStatus } from "@/lib/payments/nowpayments";
import { settlePendingLedger, type SweepResult } from "@/lib/ledger-sweep";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const { user } = await requireUser();
  if ((await entitlements.planOf(user.id)) !== "admin") throw new Error("Admins only.");
  return user;
}

/** Saves daily caps and the platform key's model and price. Takes effect within about 15 seconds. */
export async function saveSettings(input: AppConfigInput): Promise<Result> {
  try {
    const user = await requireAdmin();
    const parsed = appConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the numbers: caps are whole numbers from 0, prices are dollars per million tokens." };
    await saveAppConfig(parsed.data, user.id);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save." };
  }
}

/** Moves someone between Free and Pro (until billing does it). */
export async function setUserPlan(input: { userId: string; plan: "free" | "pro" }): Promise<Result> {
  try {
    await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(input.userId) || !["free", "pro"].includes(input.plan)) return { ok: false, error: "That user couldn't be changed." };
    const { error } = await adminClient().from("profiles").update({ plan: input.plan }).eq("id", input.userId);
    if (error) return { ok: false, error: "Couldn't change the plan. Try again." };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't change the plan." };
  }
}

/**
 * Marks an order paid and delivers it, exactly as the payment webhook will once checkout is connected. For testing the
 * whole flow until then. Safe to press twice: a paid order is never delivered again.
 */
export async function markOrderPaid(orderId: string): Promise<Result> {
  try {
    await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, error: "That order couldn't be found." };
    const delivered = await fulfillOrder(orderId, "admin", null);
    revalidatePath("/admin");
    return delivered ? { ok: true } : { ok: false, error: "That order was already paid." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't complete the order." };
  }
}

/** Cancels an unpaid order. */
export async function cancelOrder(orderId: string): Promise<Result> {
  try {
    await requireAdmin();
    const { error } = await adminClient().from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending");
    if (error) return { ok: false, error: "Couldn't cancel it." };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't cancel it." };
  }
}

/** Looks up SpicyAPI's final charge for calls still showing an estimate (a button on Admin; also run nightly). */
export async function settleCharges(): Promise<{ ok: true; sweep: SweepResult } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const sweep = await settlePendingLedger(adminClient(), { limit: 150, budgetMs: 8000 });
    revalidatePath("/admin");
    return { ok: true, sweep };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't check with SpicyAPI." };
  }
}

export type PaymentsStatus = {
  telegram: { configured: boolean; username?: string; connected?: boolean; lastError?: string | null; error?: string };
  crypto: { configured: boolean; ok?: boolean; sandbox?: boolean; error?: string };
};

/** Whether each way to pay is set up and working, for Admin → Payments. */
export async function getPaymentsStatus(): Promise<PaymentsStatus> {
  await requireAdmin();
  const telegram: PaymentsStatus["telegram"] = { configured: telegramEnabled() };
  const crypto: PaymentsStatus["crypto"] = { configured: nowpaymentsEnabled() };
  await Promise.all([
    telegram.configured &&
      telegramStatus().then(
        (s) => Object.assign(telegram, s),
        (e) => (telegram.error = e instanceof Error ? e.message : "Couldn't reach Telegram."),
      ),
    crypto.configured &&
      nowpaymentsStatus().then(
        (s) => Object.assign(crypto, s),
        (e) => (crypto.error = e instanceof Error ? e.message : "Couldn't reach NOWPayments."),
      ),
  ]);
  return { telegram, crypto };
}

/** Points the Telegram bot at this site (its webhook and commands). Safe to press again. */
export async function connectTelegram(): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const r = await connectTelegramBot();
    return { ok: true, username: r.username };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't connect the bot." };
  }
}

/**
 * Adds tokens to someone (including yourself), or removes them. Added tokens never expire; removing takes from the
 * tokens that expire soonest first, and never more than they have. Recorded in their token activity.
 */
export async function adjustTokens(input: { userId: string; delta: number; note?: string }): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const userId = String(input?.userId ?? "");
    const delta = Math.trunc(Number(input?.delta));
    const note = String(input?.note ?? "").trim().slice(0, 120) || null;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: "That person couldn't be found." };
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) return { ok: false, error: "Enter a whole number of tokens (not 0)." };
    const db = adminClient();
    const balance = async () => Number((await db.rpc("credit_balance", { p_user: userId })).data ?? 0);
    if (delta > 0) {
      const { error } = await db.from("credit_lots").insert({ user_id: userId, source: "admin", amount: delta, remaining: delta, note });
      if (error) return { ok: false, error: "Couldn't add the tokens." };
    } else {
      const take = Math.min(-delta, await balance());
      if (take <= 0) return { ok: false, error: "They have no tokens to remove." };
      const { error } = await db.rpc("spend_credits", { p_user: userId, p_amount: take, p_reason: note ? `admin: ${note}` : "admin", p_ref: null });
      if (error) return { ok: false, error: "Couldn't remove the tokens." };
    }
    revalidatePath("/admin");
    return { ok: true, balance: await balance() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't change the tokens." };
  }
}
