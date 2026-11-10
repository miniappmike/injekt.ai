import { NextResponse } from "next/server";
import { env } from "@/env";
import { adminClient } from "@/lib/supabase/admin";
import { cleanupExpiredGenerations, isAuthorizedCron } from "@/lib/cleanup";
import { repairUncopiedPurchases } from "@/lib/marketplace/purchase";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called on a schedule by Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!isAuthorizedCron(req.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const generations = await cleanupExpiredGenerations(adminClient());
    // Purchases whose files didn't all reach the buyer's folder get another try. Never fails the cleanup.
    const purchases = await repairUncopiedPurchases().catch(() => ({ repaired: 0, failed: 0 }));
    return NextResponse.json({ ok: true, ...generations, purchases });
  } catch (e) {
    console.error("cleanup failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "cleanup failed" }, { status: 500 });
  }
}
