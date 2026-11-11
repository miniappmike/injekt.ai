"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { appConfigSchema, saveAppConfig, type AppConfigInput } from "@/lib/app-config";
import { adminClient } from "@/lib/supabase/admin";
import { fulfillOrder } from "@/lib/orders";

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
