import { NextResponse } from "next/server";
import { env } from "@/env";
import { adminClient } from "@/lib/supabase/admin";
import { cleanupExpiredGenerations, isAuthorizedCron } from "@/lib/cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called on a schedule by Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!isAuthorizedCron(req.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await cleanupExpiredGenerations(adminClient())) });
  } catch (e) {
    console.error("cleanup failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "cleanup failed" }, { status: 500 });
  }
}
