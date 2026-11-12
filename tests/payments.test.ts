import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: {
    WEBHOOK_SECRET: "w".repeat(32),
    NEXT_PUBLIC_APP_URL: "https://modelspawn.test",
    TELEGRAM_BOT_TOKEN: "123:abc",
    NOWPAYMENTS_API_KEY: "np-key",
    NOWPAYMENTS_IPN_SECRET: "ipn-secret",
    NOWPAYMENTS_SANDBOX: undefined as string | undefined,
  },
  getOrder: vi.fn(),
  fulfillOrder: vi.fn(),
  renewProOrder: vi.fn(),
  setOrderStatus: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: h.env }));
vi.mock("@/lib/orders", () => ({ getOrder: h.getOrder, fulfillOrder: h.fulfillOrder, renewProOrder: h.renewProOrder, setOrderStatus: h.setOrderStatus }));

import { createCryptoInvoice, handleIpn, validIpnSignature } from "@/lib/payments/nowpayments";
import { createStarsInvoiceLink, handleTelegramUpdate, precheckProblem, SUBSCRIPTION_SECONDS } from "@/lib/payments/telegram";

const order = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "u1",
  kind: "pack",
  credits: 525,
  amount_cents: 2500,
  amount_stars: 1900,
  status: "pending",
  provider: "telegram",
  provider_ref: null,
  ...over,
});

// Telegram's API: records each call and answers ok.
const calls: { method: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  h.fulfillOrder.mockResolvedValue(true);
  h.renewProOrder.mockResolvedValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (url.includes("api.telegram.org")) {
        const method = url.split("/").pop() as string;
        calls.push({ method, body });
        return new Response(JSON.stringify({ ok: true, result: method === "createInvoiceLink" ? "https://t.me/$invoice" : true }));
      }
      calls.push({ method: url, body });
      return new Response(JSON.stringify({ id: "inv1", invoice_url: "https://nowpayments.io/payment/?iid=inv1" }));
    }),
  );
});

describe("NOWPayments", () => {
  const sign = (body: Record<string, unknown>) => createHmac("sha512", "ipn-secret").update(JSON.stringify(body, Object.keys(body).sort())).digest("hex");

  it("accepts only notices signed with the IPN secret", () => {
    const body = { payment_status: "finished", order_id: "o1", price_amount: 25, payment_id: 5 };
    expect(validIpnSignature(body, sign(body))).toBe(true);
    expect(validIpnSignature({ ...body, price_amount: 1 }, sign(body))).toBe(false);
    expect(validIpnSignature(body, null)).toBe(false);
    expect(validIpnSignature(body, "00")).toBe(false);
  });

  it("makes an invoice for the order's dollar price that reports back to the site", async () => {
    const url = await createCryptoInvoice({ orderId: "o1", amountCents: 2500, label: "525 Model Spawn tokens", kind: "pack" });
    expect(url).toContain("nowpayments.io");
    expect(calls[0].method).toBe("https://api.nowpayments.io/v1/invoice");
    expect(calls[0].body).toMatchObject({ price_amount: 25, price_currency: "usd", order_id: "o1", ipn_callback_url: "https://modelspawn.test/api/webhooks/nowpayments" });
  });

  it("delivers a finished payment for the right amount, once", async () => {
    h.getOrder.mockResolvedValue(order({ provider: "nowpayments" }));
    expect(await handleIpn({ payment_status: "finished", order_id: "o1", price_amount: "25", price_currency: "usd", payment_id: 77, pay_amount: "25.1", actually_paid: "25.1" })).toBe("delivered");
    expect(h.fulfillOrder).toHaveBeenCalledWith(order().id, "nowpayments", "77");
    h.fulfillOrder.mockResolvedValue(false);
    expect(await handleIpn({ payment_status: "finished", order_id: "o1", price_amount: 25, price_currency: "USD", payment_id: 77, pay_amount: 25.1, actually_paid: 25.1 })).toBe("already delivered");
  });

  it("a payment marked finished still needs enough to have arrived (within the 1% covering)", async () => {
    h.getOrder.mockResolvedValue(order({ provider: "nowpayments" }));
    const base = { payment_status: "finished", order_id: "o1", price_amount: 25, price_currency: "usd", payment_id: 78, pay_amount: 0.0004 };
    expect(await handleIpn({ ...base, actually_paid: 0.00001 })).toBe("underpaid");
    expect(h.setOrderStatus).toHaveBeenLastCalledWith(order().id, "underpaid");
    expect(await handleIpn({ ...base, actually_paid: undefined })).toBe("underpaid");
    expect(h.fulfillOrder).not.toHaveBeenCalled();
    expect(await handleIpn({ ...base, actually_paid: 0.000397 })).toBe("delivered"); // 0.75% short: covered
  });

  it("never delivers the wrong amount, an unfinished or a failed payment, or another provider's order", async () => {
    h.getOrder.mockResolvedValue(order({ provider: "nowpayments" }));
    expect(await handleIpn({ payment_status: "finished", order_id: "o1", price_amount: 2.5, price_currency: "usd" })).toBe("amount mismatch");
    expect(await handleIpn({ payment_status: "partially_paid", order_id: "o1" })).toBe("recorded partially_paid");
    expect(h.setOrderStatus).toHaveBeenLastCalledWith(order().id, "partially_paid", false);
    expect(await handleIpn({ payment_status: "expired", order_id: "o1" })).toBe("recorded expired");
    expect(h.setOrderStatus).toHaveBeenLastCalledWith(order().id, "expired", true);
    h.getOrder.mockResolvedValue(order({ provider: "telegram" }));
    expect(await handleIpn({ payment_status: "finished", order_id: "o1", price_amount: 25, price_currency: "usd" })).toBe("not a crypto order");
    expect(h.fulfillOrder).not.toHaveBeenCalled();
  });
});

describe("Telegram Stars", () => {
  it("makes Pro a 30-day Stars subscription and a pack a single payment", async () => {
    await createStarsInvoiceLink({ orderId: "o1", kind: "pro", amountStars: 750, label: "Model Spawn Pro (30 days, 220 tokens)" });
    expect(calls[0]).toMatchObject({ method: "createInvoiceLink", body: { payload: "o1", currency: "XTR", prices: [{ amount: 750 }], subscription_period: SUBSCRIPTION_SECONDS } });
    await createStarsInvoiceLink({ orderId: "o2", kind: "pack", amountStars: 1900, label: "525 Model Spawn tokens" });
    expect(calls[1].body.subscription_period).toBeUndefined();
  });

  it("checks the order before Telegram takes the Stars", async () => {
    expect(precheckProblem(order() as never, { currency: "XTR", total_amount: 1900 })).toBeNull();
    expect(precheckProblem(null, { currency: "XTR", total_amount: 1900 })).toMatch(/wasn't found/);
    expect(precheckProblem(order({ status: "paid" }) as never, { currency: "XTR", total_amount: 1900 })).toMatch(/already paid/);
    expect(precheckProblem(order() as never, { currency: "XTR", total_amount: 10 })).toMatch(/price changed/);
    expect(precheckProblem(order({ provider: "nowpayments" }) as never, { currency: "XTR", total_amount: 1900 })).toMatch(/isn't a Telegram/);

    h.getOrder.mockResolvedValue(order());
    await handleTelegramUpdate({ update_id: 1, pre_checkout_query: { id: "q1", currency: "XTR", total_amount: 1900, invoice_payload: order().id } });
    expect(calls.at(-1)).toMatchObject({ method: "answerPreCheckoutQuery", body: { pre_checkout_query_id: "q1", ok: true } });
  });

  const paid = (over: Record<string, unknown> = {}) => ({
    update_id: 2,
    message: { chat: { id: 9 }, successful_payment: { currency: "XTR", total_amount: 1900, invoice_payload: order().id, telegram_payment_charge_id: "ch1", ...over } },
  });

  it("delivers a paid order and says so in the chat", async () => {
    h.getOrder.mockResolvedValue(order());
    await handleTelegramUpdate(paid());
    expect(h.fulfillOrder).toHaveBeenCalledWith(order().id, "telegram", "ch1");
    expect(calls.at(-1)).toMatchObject({ method: "sendMessage", body: { chat_id: 9 } });
    expect(String(calls.at(-1)?.body.text)).toMatch(/525 tokens were added/);
  });

  it("each Pro renewal becomes a new month, under its own payment id", async () => {
    h.getOrder.mockResolvedValue(order({ kind: "pro", credits: 220, amount_stars: 750, status: "paid" }));
    await handleTelegramUpdate(paid({ total_amount: 750, is_recurring: true, telegram_payment_charge_id: "ch2" }));
    expect(h.renewProOrder).toHaveBeenCalledWith(expect.objectContaining({ kind: "pro" }), "telegram", "ch2");
    expect(h.fulfillOrder).not.toHaveBeenCalled();
    // The first payment of the subscription is the order itself.
    h.getOrder.mockResolvedValue(order({ kind: "pro", credits: 220, amount_stars: 750 }));
    await handleTelegramUpdate(paid({ total_amount: 750, is_recurring: true, is_first_recurring: true, telegram_payment_charge_id: "ch1" }));
    expect(h.fulfillOrder).toHaveBeenCalledWith(order().id, "telegram", "ch1");
  });

  it("never delivers a payment that doesn't match its order", async () => {
    h.getOrder.mockResolvedValue(order());
    await handleTelegramUpdate(paid({ total_amount: 5 }));
    expect(h.fulfillOrder).not.toHaveBeenCalled();
    expect(String(calls.at(-1)?.body.text)).toMatch(/couldn't match it/);
  });

  it("answers /terms and /support", async () => {
    await handleTelegramUpdate({ update_id: 3, message: { chat: { id: 9 }, text: "/terms" } });
    expect(String(calls.at(-1)?.body.text)).toContain("https://modelspawn.test/terms");
    await handleTelegramUpdate({ update_id: 4, message: { chat: { id: 9 }, text: "/support" } });
    expect(String(calls.at(-1)?.body.text)).toContain("modelspawn@gmail.com");
  });
});
