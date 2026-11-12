import "server-only";
import { randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { telegramApi, telegramEnabled } from "@/lib/payments/telegram";

/**
 * Telegram alerts for admins: the payment bot messages you when money comes in (Telegram Stars or crypto), when a
 * Pro subscription renews, when a crypto payment arrives short, and when someone signs up.
 *
 * Connecting: Admin → Orders → Payments → "Connect my Telegram for alerts" makes a one-time code (kept 15 minutes in
 * your settings) and opens the bot with it; pressing Start sends /start alerts_<code>, and the bot saves your chat.
 */

const CODE_MINUTES = 15;

type AlertPrefs = { telegramAlert?: { chatId: number; connectedAt: string }; telegramAlertLink?: { code: string; expires: string } };

async function loadPrefs(userId: string): Promise<Record<string, unknown> & AlertPrefs> {
  const { data } = await adminClient().from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return ((data?.prefs as Record<string, unknown> | null) ?? {}) as Record<string, unknown> & AlertPrefs;
}
const savePrefs = (userId: string, prefs: Record<string, unknown>) => adminClient().from("user_settings").update({ prefs }).eq("user_id", userId);

/** A link that opens the bot and connects this admin's Telegram for alerts. */
export async function alertConnectLink(userId: string, botUsername: string): Promise<string> {
  const code = randomBytes(12).toString("hex");
  const prefs = await loadPrefs(userId);
  const { error } = await savePrefs(userId, { ...prefs, telegramAlertLink: { code, expires: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString() } });
  if (error) throw new Error("Couldn't start connecting. Try again.");
  return `https://t.me/${botUsername}?start=alerts_${code}`;
}

/** The bot got "/start alerts_<code>": saves the chat for that admin. Returns what to reply. */
export async function connectAlertChat(code: string, chatId: number): Promise<string> {
  if (!/^[0-9a-f]{24}$/.test(code)) return "That link isn't valid. Open it again from Admin.";
  const db = adminClient();
  const { data } = await db.from("user_settings").select("user_id, prefs").eq("prefs->telegramAlertLink->>code", code).maybeSingle();
  const prefs = (data?.prefs ?? {}) as Record<string, unknown> & AlertPrefs;
  if (!data || !prefs.telegramAlertLink || Date.parse(prefs.telegramAlertLink.expires) < Date.now()) return "That link has expired. Press Connect again in Admin.";
  const { data: profile } = await db.from("profiles").select("is_admin").eq("id", data.user_id).maybeSingle();
  if (profile?.is_admin !== true) return "Only Model Spawn admins can get alerts.";
  const { telegramAlertLink: _used, ...rest } = prefs;
  await savePrefs(data.user_id as string, { ...rest, telegramAlert: { chatId, connectedAt: new Date().toISOString() } });
  return "✅ Alerts are on. You'll get a message here when someone pays, when Pro renews, when a crypto payment arrives short, and when someone signs up.";
}

/** Whether this admin has alerts connected. */
export async function alertStatus(userId: string): Promise<{ connected: boolean; since: string | null }> {
  const a = (await loadPrefs(userId)).telegramAlert;
  return { connected: !!a?.chatId, since: a?.connectedAt ?? null };
}

/** Turns alerts off for this admin. */
export async function disconnectAlerts(userId: string): Promise<void> {
  const { telegramAlert: _off, telegramAlertLink: _link, ...rest } = await loadPrefs(userId);
  await savePrefs(userId, rest);
}

/** Every admin chat that has alerts on. */
async function alertChats(): Promise<number[]> {
  const db = adminClient();
  const { data: admins } = await db.from("profiles").select("id").eq("is_admin", true);
  const ids = (admins ?? []).map((a) => a.id as string);
  if (!ids.length) return [];
  const { data } = await db.from("user_settings").select("prefs").in("user_id", ids);
  return (data ?? []).map((r) => (r.prefs as AlertPrefs | null)?.telegramAlert?.chatId).filter((c): c is number => typeof c === "number");
}

/** Sends an alert to every connected admin. Never throws: an alert must never break a payment. */
export async function alertAdmins(text: string, chats?: number[]): Promise<void> {
  if (!telegramEnabled()) return;
  try {
    const to = chats ?? (await alertChats());
    await Promise.all(to.map((chat_id) => telegramApi("sendMessage", { chat_id, text, link_preview_options: { is_disabled: true } }).catch(() => null)));
  } catch (e) {
    console.error("[alerts] couldn't send", e instanceof Error ? e.message : e);
  }
}

/** The buyer's email for an alert. */
async function emailOf(userId: string | null): Promise<string> {
  if (!userId) return "someone";
  const { data } = await adminClient().auth.admin.getUserById(userId);
  return data?.user?.email ?? "someone";
}

const what = (o: { kind: string; credits: number }) => (o.kind === "pro" ? `Pro (${o.credits} tokens)` : `${o.credits.toLocaleString("en-US")} tokens`);

/** A paid order: "💰 $25.00 crypto: jade@... bought 525 tokens" or "⭐ 500 Stars: ... started Pro". */
export async function alertPaid(o: { user_id: string | null; kind: string; credits: number; amount_cents: number; amount_stars: number | null }, via: "crypto" | "telegram", renewal = false): Promise<void> {
  const who = await emailOf(o.user_id);
  const price = via === "telegram" ? `⭐ ${o.amount_stars ?? 0} Stars` : `$${(o.amount_cents / 100).toFixed(2)} crypto`;
  const text = renewal ? `🔁 Pro renewed · ${price}\n${who}` : `${via === "telegram" ? "⭐" : "💰"} ${price}\n${who} bought ${what(o)}`;
  await alertAdmins(text);
}

/** A crypto payment that arrived short (waiting in Admin → Orders). */
export async function alertUnderpaid(o: { user_id: string | null; kind: string; credits: number; amount_cents: number }, paid: string, asked: string): Promise<void> {
  await alertAdmins(`⚠️ Crypto payment arrived short\n${await emailOf(o.user_id)} · ${what(o)} ($${(o.amount_cents / 100).toFixed(2)})\nSent ${paid} of ${asked}. It's waiting in Admin → Orders.`);
}

/** Someone signed up. */
export async function alertSignup(email: string): Promise<void> {
  await alertAdmins(`👋 New sign-up\n${email}`);
}
