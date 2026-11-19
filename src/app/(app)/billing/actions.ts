"use server";

import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createOrder, releasePersonaHold, type CreatedOrder, type OrderInput } from "@/lib/orders";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError, UserFacingError } from "@/lib/errors";
import { createStarsInvoiceLink, telegramEnabled } from "@/lib/payments/telegram";
import { createCryptoInvoice, nowpaymentsEnabled } from "@/lib/payments/nowpayments";
import type { PayMethod } from "@/lib/payments/methods";

export type CheckoutResult = { ok: true; order: CreatedOrder } | { ok: false; error: string };

/**
 * Starts buying Pro or a token pack: records the order, then makes the payment page for the chosen method (Telegram
 * Stars, or crypto through NOWPayments) and returns its link. The page sends the buyer there.
 */
export async function startCheckout(input: OrderInput, deviceId?: string, method: PayMethod = "telegram"): Promise<CheckoutResult> {
  try {
    const { user } = await requireUser();
    await enforceRateLimit(user.id, "checkout", 10, 60);
    if (method === "telegram" && !telegramEnabled()) throw new UserFacingError("Paying with Telegram isn't available yet.");
    if (method === "crypto" && !nowpaymentsEnabled()) throw new UserFacingError("Paying with crypto isn't available yet.");
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const device = typeof deviceId === "string" && /^[\w-]{8,64}$/.test(deviceId) ? deviceId : null;
    const kind: OrderInput =
      input?.kind === "pro"
        ? { kind: "pro" }
        : input?.kind === "persona"
          ? { kind: "persona", listingId: String((input as { listingId?: unknown }).listingId ?? "") }
          : { kind: "pack", packId: String((input as { packId?: unknown })?.packId ?? "") };
    const order = await createOrder(user, kind, { deviceId: device, ip }, method === "telegram" ? "telegram" : "nowpayments");
    try {
      order.checkoutUrl = method === "telegram" ? await createStarsInvoiceLink(order) : await createCryptoInvoice(order);
    } catch (e) {
      console.error(`[checkout] ${method} payment page failed`, e instanceof Error ? e.message : e);
      throw new UserFacingError(`Couldn't open the ${method === "telegram" ? "Telegram" : "crypto"} payment. Try again in a moment.`);
    }
    return { ok: true, order };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: `Too many tries. Try again in ${e.retryAfterSeconds}s.` };
    if (e instanceof UserFacingError) return { ok: false, error: e.message };
    console.error("checkout failed", e);
    return { ok: false, error: "Couldn't start checkout. Try again." };
  }
}

/** Gives up the buyer's 15-minute hold on a persona (they closed checkout without paying). */
export async function releaseCheckoutHold(listingId: string): Promise<void> {
  try {
    const { user } = await requireUser();
    if (/^[0-9a-f-]{36}$/i.test(listingId)) await releasePersonaHold(listingId, user.id);
  } catch {
    // The hold simply runs out after 15 minutes.
  }
}
