import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/env";
import { PRO } from "@/lib/plans";
import { CONTACT_EMAIL } from "@/lib/links";
import { fulfillOrder, getOrder, renewProOrder, type StoredOrder } from "@/lib/orders";

/**
 * Telegram Stars payments through the Model Spawn bot.
 *
 * Checkout: the site makes an invoice link for the order (Pro as a 30-day Stars subscription, packs as one payment) and
 * sends the buyer to it; Telegram opens the payment, where they can buy Stars with a card, Apple Pay or Google Pay.
 * Telegram then sends the bot's updates to /api/webhooks/telegram: a pre-checkout check (answered here), then the
 * successful payment, which delivers the order once. Each Pro renewal arrives as another successful payment.
 */

export const telegramEnabled = () => !!env.TELEGRAM_BOT_TOKEN;

/** Telegram's subscription period: exactly 30 days, the only one it allows. */
export const SUBSCRIPTION_SECONDS = 2_592_000;

/** The secret Telegram sends with every update (set with setWebhook), so nobody else can post to the webhook. */
export function telegramWebhookSecret(): string {
  return createHmac("sha256", env.WEBHOOK_SECRET).update(`telegram:${env.TELEGRAM_BOT_TOKEN ?? ""}`).digest("hex").slice(0, 64);
}

export class TelegramError extends Error {}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new TelegramError("Telegram payments aren't set up yet.");
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!json?.ok) throw new TelegramError(json?.description ?? `Telegram ${method} failed (${res.status})`);
  return json.result as T;
}

/** A link that opens the Stars payment for this order. Pro is a subscription that renews every 30 days. */
export async function createStarsInvoiceLink(order: { orderId: string; kind: "pro" | "pack"; amountStars: number; label: string }): Promise<string> {
  const pro = order.kind === "pro";
  return telegramApi<string>("createInvoiceLink", {
    title: pro ? "Model Spawn Pro" : "Model Spawn tokens",
    description: pro
      ? `${order.label}. Your own API keys, no daily limits. Renews every 30 days until you cancel in Telegram.`
      : `${order.label}, added to your account straight away. Bought tokens never expire.`,
    payload: order.orderId,
    currency: "XTR",
    prices: [{ label: order.label, amount: order.amountStars }],
    ...(pro ? { subscription_period: SUBSCRIPTION_SECONDS } : {}),
  });
}

// The parts of a Telegram update this bot reads.
interface Update {
  update_id: number;
  pre_checkout_query?: { id: string; currency: string; total_amount: number; invoice_payload: string };
  message?: {
    chat: { id: number };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      is_recurring?: boolean;
      is_first_recurring?: boolean;
    };
  };
}

const SITE = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

const say = (chatId: number, text: string) => telegramApi("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } }).catch(() => null);

/** Why an order can't be paid with this pre-checkout, or null when it can. */
export function precheckProblem(order: StoredOrder | null, q: { currency: string; total_amount: number }): string | null {
  if (!order) return "This order wasn't found. Start again from the Model Spawn site.";
  if (order.provider !== "telegram") return "This order isn't a Telegram payment. Start again from the Model Spawn site.";
  if (order.status === "cancelled" || order.status === "failed") return "This order was cancelled. Start again from the Model Spawn site.";
  if (order.status === "paid" && order.kind !== "pro") return "This order is already paid.";
  if (q.currency !== "XTR" || q.total_amount !== order.amount_stars) return "The price changed. Start again from the Model Spawn site.";
  return null;
}

/** Handles one update from Telegram. Never throws for a bad update (Telegram would just send it again). */
export async function handleTelegramUpdate(update: Update): Promise<void> {
  const q = update.pre_checkout_query;
  if (q) {
    // Telegram waits at most 10 seconds for this answer.
    const problem = precheckProblem(await getOrder(q.invoice_payload), q);
    await telegramApi("answerPreCheckoutQuery", problem ? { pre_checkout_query_id: q.id, ok: false, error_message: problem } : { pre_checkout_query_id: q.id, ok: true });
    return;
  }

  const msg = update.message;
  const paid = msg?.successful_payment;
  if (msg && paid) {
    const order = await getOrder(paid.invoice_payload);
    if (!order || paid.currency !== "XTR" || paid.total_amount !== order.amount_stars) {
      console.error("[telegram] payment that doesn't match an order", paid.invoice_payload, paid.total_amount);
      await say(msg.chat.id, `Thanks, your payment was received, but we couldn't match it to an order. Email ${CONTACT_EMAIL} with this code: ${paid.telegram_payment_charge_id}`);
      return;
    }
    // A renewal of a Pro subscription (the first payment is handled like any order).
    const renewal = order.status === "paid" && order.kind === "pro" && paid.is_recurring && !paid.is_first_recurring;
    const delivered = renewal ? await renewProOrder(order, "telegram", paid.telegram_payment_charge_id) : await fulfillOrder(order.id, "telegram", paid.telegram_payment_charge_id);
    if (delivered) {
      await say(
        msg.chat.id,
        order.kind === "pro"
          ? `${renewal ? "Renewed" : "Done"}! Your Model Spawn Pro is active for ${PRO.days} days, with ${renewal ? PRO.monthlyCredits : order.credits} tokens. It renews every 30 days until you cancel it in Telegram.\n\n${SITE()}/characters`
          : `Done! ${order.credits.toLocaleString("en-US")} tokens were added to your Model Spawn account.\n\n${SITE()}/tokens`,
      );
    }
    return;
  }

  // Commands. Telegram asks bots that take payments to offer terms and support.
  const text = msg?.text?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!msg || !text) return;
  if (text === "/terms") return void (await say(msg.chat.id, `Terms of Service: ${SITE()}/terms\nPrivacy Policy: ${SITE()}/privacy`));
  if (text === "/support" || text === "/paysupport")
    return void (await say(msg.chat.id, `For help with a payment, email ${CONTACT_EMAIL} with your Telegram payment receipt. All sales are final (see /terms).`));
  if (text === "/start")
    return void (await say(msg.chat.id, `This is the Model Spawn payment bot. Buy tokens or Pro on the site, and pay here with Telegram Stars.\n\n${SITE()}/tokens\n\n/terms · /support`));
}

/** Points Telegram at this site's webhook and sets the bot's commands. Run once from Admin after adding the token. */
export async function connectTelegramBot(): Promise<{ username: string; url: string }> {
  const url = `${SITE()}/api/webhooks/telegram`;
  await telegramApi("setWebhook", {
    url,
    secret_token: telegramWebhookSecret(),
    allowed_updates: ["message", "pre_checkout_query"],
    drop_pending_updates: false,
  });
  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "About this bot" },
      { command: "terms", description: "Terms of Service and Privacy Policy" },
      { command: "support", description: "Help with a payment" },
      { command: "paysupport", description: "Help with a payment" },
    ],
  });
  const me = await telegramApi<{ username: string }>("getMe");
  return { username: me.username, url };
}

/** The bot's name and whether its webhook points here, for Admin. */
export async function telegramStatus(): Promise<{ username: string; connected: boolean; lastError: string | null }> {
  const [me, hook] = await Promise.all([
    telegramApi<{ username: string }>("getMe"),
    telegramApi<{ url: string; last_error_message?: string }>("getWebhookInfo"),
  ]);
  return { username: me.username, connected: hook.url === `${SITE()}/api/webhooks/telegram`, lastError: hook.last_error_message ?? null };
}
