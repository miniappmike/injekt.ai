import "server-only";
import { createHmac } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/env";
import { PRO, packById } from "@/lib/plans";
import { emailKey, isDisposableEmail, type BonusBlock } from "@/lib/orders-core";
import { UserFacingError } from "@/lib/errors";

/**
 * Orders for Pro passes and credit packs. Making an order records what is being bought and who is buying; a payment
 * provider (not connected yet) takes the money and then calls fulfillOrder, which delivers it once. Until a provider
 * is connected, an admin can mark an order paid on the admin page to test the whole flow.
 */

/** A one-way fingerprint of the device or network, keyed so it can't be matched outside this site. */
export const fingerprint = (value: string | null | undefined) =>
  value ? createHmac("sha256", env.WEBHOOK_SECRET).update(value).digest("hex").slice(0, 32) : null;

export interface Buyer {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}
export interface BuyerContext {
  /** A random id the browser keeps for this device. */
  deviceId?: string | null;
  ip?: string | null;
}

/** Whether the first-month bonus can be given, and if not, why. */
export async function bonusCheck(buyer: Buyer, ctx: BuyerContext): Promise<{ ok: true } | { ok: false; reason: BonusBlock }> {
  if (!buyer.email || !buyer.email_confirmed_at) return { ok: false, reason: "unconfirmed_email" };
  if (isDisposableEmail(buyer.email)) return { ok: false, reason: "disposable_email" };
  const db = adminClient();
  const [{ count: paidPro }, { data: claims }] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", buyer.id).eq("kind", "pro").eq("status", "paid"),
    claimsMatching(buyer, ctx),
  ]);
  if ((paidPro ?? 0) > 0) return { ok: false, reason: "already_pro" };
  if ((claims ?? []).length > 0) return { ok: false, reason: "claimed" };
  return { ok: true };
}

function claimsMatching(buyer: Buyer, ctx: BuyerContext) {
  const ors = [`user_id.eq.${buyer.id}`, `email_key.eq.${emailKey(buyer.email ?? "")}`];
  const device = fingerprint(ctx.deviceId);
  const ip = fingerprint(ctx.ip);
  if (device) ors.push(`device_hash.eq.${device}`);
  if (ip) ors.push(`ip_hash.eq.${ip}`);
  return adminClient().from("bonus_claims").select("user_id").or(ors.join(",")).limit(1);
}

export type OrderInput = { kind: "pro" } | { kind: "pack"; packId: string };

export interface CreatedOrder {
  orderId: string;
  kind: "pro" | "pack";
  credits: number;
  amountCents: number;
  firstMonthBonus: boolean;
  /** Where to send the buyer to pay. Null until a payment provider is connected. */
  checkoutUrl: string | null;
}

export async function createOrder(buyer: Buyer, input: OrderInput, ctx: BuyerContext): Promise<CreatedOrder> {
  const db = adminClient();
  let row: { kind: "pro" | "pack"; pack_id: string | null; credits: number; amount_cents: number; first_month_bonus: boolean };
  if (input.kind === "pack") {
    const pack = packById(input.packId);
    if (!pack) throw new UserFacingError("That token pack doesn't exist.");
    row = { kind: "pack", pack_id: pack.id, credits: pack.credits, amount_cents: pack.priceCents, first_month_bonus: false };
  } else {
    const bonus = (await bonusCheck(buyer, ctx)).ok;
    row = { kind: "pro", pack_id: null, credits: bonus ? PRO.firstMonthCredits : PRO.monthlyCredits, amount_cents: PRO.priceCents, first_month_bonus: bonus };
  }
  const { data, error } = await db
    .from("orders")
    .insert({
      ...row,
      user_id: buyer.id,
      email_key: buyer.email ? emailKey(buyer.email) : null,
      device_hash: fingerprint(ctx.deviceId),
      ip_hash: fingerprint(ctx.ip),
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(/orders/.test(error?.message ?? "") ? "Checkout isn't set up yet (run migration 0023)." : "Couldn't start checkout. Try again.");
  return { orderId: data.id as string, kind: row.kind, credits: row.credits, amountCents: row.amount_cents, firstMonthBonus: row.first_month_bonus, checkoutUrl: null };
}

/**
 * Delivers a paid order, once: credits for a pack; 30 days and that month's credits for Pro. Safe to call again for
 * the same order (a repeated webhook): returns false and changes nothing.
 */
export async function fulfillOrder(orderId: string, provider: string | null = null, providerRef: string | null = null): Promise<boolean> {
  const { data, error } = await adminClient().rpc("fulfill_order", {
    p_order: orderId,
    p_provider: provider,
    p_provider_ref: providerRef,
    p_days: PRO.days,
    p_monthly: PRO.monthlyCredits,
  });
  if (error) throw new Error(error.message.includes("order_not_found") ? "That order doesn't exist." : "Couldn't complete the order.");
  return data === true;
}
