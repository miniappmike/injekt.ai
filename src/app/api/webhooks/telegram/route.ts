import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleTelegramUpdate, telegramEnabled, telegramWebhookSecret } from "@/lib/payments/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Telegram posts the payment bot's updates here (set up from Admin → Payments → Connect Telegram bot).
export async function POST(req: Request) {
  if (!telegramEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  // Only Telegram knows this secret (it was given to Telegram with setWebhook).
  if (!same(req.headers.get("x-telegram-bot-api-secret-token") ?? "", telegramWebhookSecret())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: true });
  try {
    await handleTelegramUpdate(update);
  } catch (e) {
    // A 500 makes Telegram send the update again, which is what we want for a delivery that failed part-way.
    console.error("[telegram] update failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
