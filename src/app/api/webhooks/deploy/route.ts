import { NextResponse } from "next/server";
import { deployAlertsEnabled, handleDeployWebhook, validDeploySignature } from "@/lib/deploy-alerts";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vercel (or GitHub's deployment_status event) posts here when a deployment finishes; the admins' Telegram gets a message.
export async function POST(req: Request) {
  if (!deployAlertsEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  if (!validDeploySignature(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    console.info(`[deploy] ${await handleDeployWebhook(req.headers, body)}`);
  } catch (e) {
    console.error("[deploy] alert failed", e instanceof Error ? e.message : e);
  }
  // Always 200 once the signature is good: alertAdmins never throws, and a retry would only repeat the message.
  return NextResponse.json({ ok: true });
}
