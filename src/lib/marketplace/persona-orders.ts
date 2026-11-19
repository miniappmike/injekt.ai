import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { StoredOrder } from "@/lib/orders";
import { needsRefund, recordPurchase, type PurchaseOutcome } from "@/lib/marketplace/purchase";

/**
 * Delivering a paid persona order (Telegram Stars or crypto): the sale goes through purchase_persona (recordPurchase),
 * which checks she is still the buyer's to have and at the price they reserved, and gives them their own copy. Only
 * then is the order marked paid. If she wasn't theirs to have (sold, someone else's hold, a price mismatch), the order
 * is marked failed with why, and the caller refunds the payment.
 *
 * Safe to call again for the same payment (a repeated webhook): purchase_persona reports the first result.
 */
export interface PersonaDelivery {
  /** The sale went through now ("purchased") or earlier ("already_recorded"). */
  delivered: boolean;
  /** This call is the one that completed it (send the thank-you and the alert once). */
  firstTime: boolean;
  /** The money must go back to the buyer. */
  refund: boolean;
  outcome: PurchaseOutcome;
  characterId: string | null;
}

export async function fulfilPersonaOrder(order: StoredOrder, provider: "telegram" | "nowpayments" | "admin", paymentRef: string): Promise<PersonaDelivery> {
  if (order.kind !== "persona" || !order.listing_id) throw new Error(`order ${order.id} is not a persona order`);
  // The account was deleted before the payment arrived: nobody to give her to.
  if (!order.user_id) {
    await markOrder(order.id, "failed", "buyer_deleted", provider, paymentRef);
    return { delivered: false, firstTime: false, refund: true, outcome: "unavailable", characterId: null };
  }
  const r = await recordPurchase({
    listingId: order.listing_id,
    buyerId: order.user_id,
    provider,
    providerPaymentId: `${provider}:${paymentRef}`,
    amountCents: order.amount_cents,
  });
  if (needsRefund(r.outcome)) {
    await markOrder(order.id, "failed", r.outcome, provider, paymentRef);
    return { delivered: false, firstTime: false, refund: true, outcome: r.outcome, characterId: null };
  }
  // Marked paid here even on a repeat ("already_recorded"): a first try that sold her but stopped before this line is
  // finished by the retry. Whichever call marks it is the "first time" (thank-you and alert go once).
  const firstTime = await markOrder(order.id, "paid", "delivered", provider, paymentRef);
  return { delivered: true, firstTime, refund: false, outcome: r.outcome, characterId: r.characterId };
}

/** Records how a persona order ended. Returns true when this call changed it (it was still pending). */
async function markOrder(id: string, status: "paid" | "failed", providerStatus: string, provider: string, ref: string): Promise<boolean> {
  const { data } = await adminClient()
    .from("orders")
    .update({ status, provider_status: providerStatus, provider, provider_ref: ref, ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  return (data ?? []).length > 0;
}

/** Why a persona can't be paid for right now, for Telegram's pre-checkout (refusing there means no payment is taken). */
export async function personaPrecheckProblem(order: StoredOrder): Promise<string | null> {
  if (!order.listing_id) return "This order wasn't found. Start again from the ModelSpawn site.";
  const { data } = await adminClient().from("marketplace_listings").select("status, reserved_by, reserved_until").eq("id", order.listing_id).maybeSingle();
  if (!data) return "This persona isn't for sale any more.";
  if (data.status === "sold") return "She was just bought by someone else. You haven't been charged.";
  const heldByOther = data.status === "reserved" && data.reserved_by !== order.user_id && !!data.reserved_until && new Date(data.reserved_until as string).getTime() > Date.now();
  if (heldByOther) return "Someone else is checking out with her right now. You haven't been charged.";
  if (data.status !== "available" && data.status !== "reserved") return "This persona isn't for sale any more.";
  return null;
}
