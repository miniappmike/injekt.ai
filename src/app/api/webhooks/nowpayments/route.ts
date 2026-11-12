import { NextResponse } from "next/server";
import { handleIpn, nowpaymentsEnabled, validIpnSignature, type IpnBody } from "@/lib/payments/nowpayments";

export const runtime = "nodejs";
export const maxDuration = 30;

// NOWPayments posts payment notices (IPN) here for every invoice the site creates.
export async function POST(req: Request) {
  if (!nowpaymentsEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !validIpnSignature(body, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  try {
    const result = await handleIpn(body as IpnBody);
    console.info(`[nowpayments] ${String(body.order_id)} ${String(body.payment_status)}: ${result}`);
  } catch (e) {
    // A 500 makes NOWPayments send the notice again.
    console.error("[nowpayments] notice failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
