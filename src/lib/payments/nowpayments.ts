import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { fulfillOrder, getOrder, setOrderStatus } from "@/lib/orders";

/**
 * Crypto payments through NOWPayments.
 *
 * Checkout: the site creates an invoice for the order's dollar price and sends the buyer to NOWPayments' payment page,
 * where they pick a coin and pay. NOWPayments then posts payment notices (IPN) to /api/webhooks/nowpayments, signed
 * with your IPN secret. When a payment is finished for the right amount, the order is delivered once.
 */

export const nowpaymentsEnabled = () => !!env.NOWPAYMENTS_API_KEY && !!env.NOWPAYMENTS_IPN_SECRET;
const base = () => (env.NOWPAYMENTS_SANDBOX === "1" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");
const SITE = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export class NowPaymentsError extends Error {}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!env.NOWPAYMENTS_API_KEY) throw new NowPaymentsError("Crypto payments aren't set up yet.");
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? "GET",
    headers: { "x-api-key": env.NOWPAYMENTS_API_KEY, "content-type": "application/json" },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !json) throw new NowPaymentsError(json?.message ?? `NOWPayments request failed (${res.status})`);
  return json;
}

/** An invoice page for this order, in US dollars. The buyer chooses the coin there. */
export async function createCryptoInvoice(order: { orderId: string; amountCents: number; label: string; kind: "pro" | "pack" }): Promise<string> {
  const r = await api<{ id: string; invoice_url: string }>("/invoice", {
    method: "POST",
    body: {
      price_amount: order.amountCents / 100,
      price_currency: "usd",
      order_id: order.orderId,
      order_description: order.label,
      ipn_callback_url: `${SITE()}/api/webhooks/nowpayments`,
      success_url: `${SITE()}/tokens?paid=1`,
      cancel_url: `${SITE()}/${order.kind === "pro" ? "upgrade" : "tokens"}`,
    },
  });
  if (!r.invoice_url) throw new NowPaymentsError("NOWPayments didn't return a payment page.");
  return r.invoice_url;
}

/** NOWPayments is reachable and the API key works (for Admin). */
export async function nowpaymentsStatus(): Promise<{ ok: boolean; sandbox: boolean }> {
  const r = await api<{ message?: string }>("/status");
  return { ok: r.message === "OK", sandbox: env.NOWPAYMENTS_SANDBOX === "1" };
}

// Sorts object keys at every level, the way NOWPayments signs its notices.
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Whether a notice really came from NOWPayments: an HMAC-SHA512 of the body with its keys sorted, made with your IPN
 * secret. Both of NOWPayments' documented ways of sorting are accepted.
 */
export function validIpnSignature(body: Record<string, unknown>, signature: string | null, secret = env.NOWPAYMENTS_IPN_SECRET): boolean {
  if (!signature || !secret) return false;
  const sign = (s: string) => createHmac("sha512", secret).update(s).digest("hex");
  const sig = signature.trim().toLowerCase();
  return same(sign(JSON.stringify(sortDeep(body))), sig) || same(sign(JSON.stringify(body, Object.keys(body).sort())), sig);
}

export interface IpnBody {
  payment_id?: number | string;
  payment_status?: string;
  order_id?: string;
  price_amount?: number | string;
  price_currency?: string;
}

/** Statuses that mean the payment won't complete. */
const DEAD = new Set(["failed", "expired", "refunded"]);

/** Handles one signed payment notice. Returns what happened, for the logs. */
export async function handleIpn(body: IpnBody): Promise<string> {
  const status = String(body.payment_status ?? "");
  const order = body.order_id ? await getOrder(String(body.order_id)) : null;
  if (!order) return "unknown order";
  if (order.provider !== "nowpayments") return "not a crypto order";

  if (status !== "finished") {
    // Waiting, confirming, partially paid and so on: just record it. Failed or expired: the order is closed.
    await setOrderStatus(order.id, status, DEAD.has(status));
    return `recorded ${status}`;
  }
  // The invoice was for this order's price in US dollars; anything else is not this order's payment.
  const price = Math.round(Number(body.price_amount) * 100);
  if (String(body.price_currency).toLowerCase() !== "usd" || price !== order.amount_cents) {
    await setOrderStatus(order.id, "amount_mismatch");
    console.error("[nowpayments] amount doesn't match the order", order.id, body.price_amount, body.price_currency);
    return "amount mismatch";
  }
  const delivered = await fulfillOrder(order.id, "nowpayments", body.payment_id ? String(body.payment_id) : null);
  return delivered ? "delivered" : "already delivered";
}
