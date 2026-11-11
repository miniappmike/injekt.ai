"use server";

import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createOrder, type CreatedOrder } from "@/lib/orders";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError, UserFacingError } from "@/lib/errors";

export type CheckoutResult = { ok: true; order: CreatedOrder } | { ok: false; error: string };

/**
 * Starts buying Pro or a credit pack: records the order and returns where to pay. No payment provider is connected
 * yet, so `checkoutUrl` is null and the page says checkout is coming soon.
 */
export async function startCheckout(input: { kind: "pro" } | { kind: "pack"; packId: string }, deviceId?: string): Promise<CheckoutResult> {
  try {
    const { user } = await requireUser();
    await enforceRateLimit(user.id, "checkout", 10, 60);
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const device = typeof deviceId === "string" && /^[\w-]{8,64}$/.test(deviceId) ? deviceId : null;
    const kind = input?.kind === "pro" ? ({ kind: "pro" } as const) : ({ kind: "pack", packId: String((input as { packId?: unknown })?.packId ?? "") } as const);
    return { ok: true, order: await createOrder(user, kind, { deviceId: device, ip }) };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: `Too many tries. Try again in ${e.retryAfterSeconds}s.` };
    if (e instanceof UserFacingError) return { ok: false, error: e.message };
    console.error("checkout failed", e);
    return { ok: false, error: "Couldn't start checkout. Try again." };
  }
}
