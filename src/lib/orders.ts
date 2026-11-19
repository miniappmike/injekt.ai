import "server-only";
import { createHmac } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/env";
import { PERSONA_HOLD_MINUTES, PRO, packById, personaStars } from "@/lib/plans";
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

export type OrderInput = { kind: "pro" } | { kind: "pack"; packId: string } | { kind: "persona"; listingId: string };
export type OrderKind = "pro" | "pack" | "persona";

/** How an order is paid: Telegram Stars, crypto through NOWPayments, or by hand (Admin → Mark paid). */
export type PaymentProvider = "telegram" | "nowpayments" | "manual";

export interface CreatedOrder {
  orderId: string;
  kind: OrderKind;
  /** A persona order: the listing, and when the buyer's hold on her ends (ISO time). */
  listingId?: string;
  heldUntil?: string;
  credits: number;
  amountCents: number;
  /** The Telegram Stars price. */
  amountStars: number;
  firstMonthBonus: boolean;
  label: string;
  /** Where to send the buyer to pay. Null until a payment provider is connected. */
  checkoutUrl: string | null;
}

export async function createOrder(buyer: Buyer, input: OrderInput, ctx: BuyerContext, provider: PaymentProvider = "manual"): Promise<CreatedOrder> {
  const db = adminClient();
  let row: { kind: OrderKind; pack_id: string | null; credits: number; amount_cents: number; amount_stars: number; first_month_bonus: boolean; listing_id?: string };
  let held: { until: string; name: string } | null = null;
  if (input.kind === "persona") {
    const h = await holdPersona(input.listingId, buyer.id);
    held = { until: h.until, name: h.name };
    row = { kind: "persona", pack_id: null, credits: 0, amount_cents: h.priceCents, amount_stars: personaStars(h.priceCents), first_month_bonus: false, listing_id: input.listingId };
  } else if (input.kind === "pack") {
    const pack = packById(input.packId);
    if (!pack) throw new UserFacingError("That token pack doesn't exist.");
    row = { kind: "pack", pack_id: pack.id, credits: pack.credits, amount_cents: pack.priceCents, amount_stars: pack.stars, first_month_bonus: false };
  } else {
    const bonus = (await bonusCheck(buyer, ctx)).ok;
    row = { kind: "pro", pack_id: null, credits: bonus ? PRO.firstMonthCredits : PRO.monthlyCredits, amount_cents: PRO.priceCents, amount_stars: PRO.stars, first_month_bonus: bonus };
  }
  const { data, error } = await db
    .from("orders")
    .insert({
      ...row,
      user_id: buyer.id,
      provider,
      email_key: buyer.email ? emailKey(buyer.email) : null,
      device_hash: fingerprint(ctx.deviceId),
      ip_hash: fingerprint(ctx.ip),
    })
    .select("id")
    .single();
  if (error || !data) throw new UserFacingError(/orders/.test(error?.message ?? "") ? "Checkout isn't set up yet (run migration 0023)." : "Couldn't start checkout. Try again.");
  return {
    orderId: data.id as string,
    kind: row.kind,
    credits: row.credits,
    amountCents: row.amount_cents,
    amountStars: row.amount_stars,
    firstMonthBonus: row.first_month_bonus,
    label: held ? personaLabel(held.name) : orderLabel(row.kind as "pro" | "pack", row.credits),
    checkoutUrl: null,
    ...(held ? { listingId: input.kind === "persona" ? input.listingId : undefined, heldUntil: held.until } : {}),
  };
}

/** What a persona order is: "Soo-jin, a one-of-a-kind ModelSpawn persona". */
export const personaLabel = (name: string) => `${name || "Persona"}, a one-of-a-kind ModelSpawn persona`;

/**
 * Holds a listing for this buyer for PERSONA_HOLD_MINUTES while they pay (reserve_persona). Starting checkout again
 * keeps the same hold. Throws a message the buyer can read when she can't be bought.
 */
async function holdPersona(listingId: string, buyerId: string): Promise<{ until: string; priceCents: number; name: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new UserFacingError("That persona wasn't found.");
  const db = adminClient();
  const { data, error } = await db.rpc("reserve_persona", { p_listing: listingId, p_buyer: buyerId, p_minutes: PERSONA_HOLD_MINUTES });
  if (error) throw new UserFacingError(/reserve_persona/.test(error.message) ? "Persona checkout isn't set up yet (run migration 0038)." : "Couldn't start checkout. Try again.");
  const r = (Array.isArray(data) ? data[0] : data) as { outcome: string; held_until: string | null; price_cents: number | null } | undefined;
  if (r?.outcome === "sold") throw new UserFacingError("She was just bought by someone else.");
  if (r?.outcome === "held_by_someone_else") throw new UserFacingError("Someone else is checking out with her right now. Try again in a few minutes.");
  if (r?.outcome !== "held" || !r.held_until || !r.price_cents) throw new UserFacingError("She isn't for sale right now.");
  const { data: l } = await db.from("marketplace_listings").select("name").eq("id", listingId).maybeSingle();
  return { until: new Date(r.held_until).toISOString(), priceCents: r.price_cents, name: (l?.name as string | undefined) ?? "" };
}

/** Gives up this buyer's hold on a listing (they closed checkout). Harmless if they don't hold it. */
export async function releasePersonaHold(listingId: string, buyerId: string): Promise<void> {
  await adminClient().rpc("release_persona", { p_listing: listingId, p_buyer: buyerId });
}

/** What an order is, in a few words: "ModelSpawn Pro (30 days, 220 tokens)" or "525 ModelSpawn tokens". */
export const orderLabel = (kind: "pro" | "pack", credits: number) =>
  kind === "pro" ? `ModelSpawn Pro (${PRO.days} days, ${credits} tokens)` : `${credits.toLocaleString("en-US")} ModelSpawn tokens`;

export interface StoredOrder {
  id: string;
  user_id: string | null;
  kind: OrderKind;
  /** A persona order's listing. */
  listing_id: string | null;
  credits: number;
  amount_cents: number;
  amount_stars: number | null;
  status: "pending" | "paid" | "cancelled" | "failed";
  provider: string | null;
  provider_ref: string | null;
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminClient()
    .from("orders")
    .select("id, user_id, kind, listing_id, credits, amount_cents, amount_stars, status, provider, provider_ref")
    .eq("id", id)
    .maybeSingle();
  return (data as StoredOrder | null) ?? null;
}

/** Records the provider's latest status for an order, and marks it failed when the payment didn't happen. */
export async function setOrderStatus(id: string, providerStatus: string, failed = false): Promise<void> {
  await adminClient()
    .from("orders")
    .update({ provider_status: providerStatus, ...(failed ? { status: "failed" } : {}) })
    .eq("id", id)
    .eq("status", "pending");
}

/**
 * A Telegram Pro subscription renewed: a new Pro order for the same person (the normal month, no bonus), paid and
 * delivered under the renewal's own payment id. Returns false if that payment was already handled.
 */
export async function renewProOrder(original: StoredOrder, provider: PaymentProvider, paymentRef: string): Promise<boolean> {
  if (!original.user_id) return false;
  const db = adminClient();
  const { data, error } = await db
    .from("orders")
    .insert({
      user_id: original.user_id,
      kind: "pro",
      credits: PRO.monthlyCredits,
      amount_cents: PRO.priceCents,
      amount_stars: original.amount_stars,
      provider,
      provider_ref: paymentRef,
      renews_order_id: original.id,
    })
    .select("id")
    .single();
  // The unique (provider, provider_ref) index: this renewal was already recorded.
  if (error?.code === "23505") return false;
  if (error || !data) throw new Error("Couldn't record the renewal.");
  return fulfillOrder(data.id as string, provider, paymentRef);
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
