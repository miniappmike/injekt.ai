import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { adminClient } from "@/lib/supabase/admin";
import { safeFetchBytes } from "@/lib/ssrf";
import { getImageProvider } from "@/lib/ai/providers/registry";
import { generationExpiry } from "@/lib/retention";

export const runtime = "nodejs";
export const maxDuration = 60;

function validSignature(raw: string, header: string | null) {
  if (!header) return false;
  const expected = createHmac("sha256", env.WEBHOOK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event;
  try {
    const parse = getImageProvider(provider).parseWebhook;
    if (!parse) return NextResponse.json({ error: "no webhooks for this provider" }, { status: 404 });
    event = parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const db = adminClient();
  const { data: gen } = await db
    .from("generations")
    .select("id,user_id,status")
    .eq("provider", provider)
    .eq("provider_job_id", event.jobId)
    .maybeSingle();
  if (!gen) return NextResponse.json({ ok: true }); // unknown job, ack so it is not retried
  if (gen.status === "complete" || gen.status === "failed") return NextResponse.json({ ok: true }); // idempotent

  if (event.status === "complete" && event.outputUrl) {
    const { bytes, contentType } = await safeFetchBytes(event.outputUrl);
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `${gen.user_id}/${gen.id}.${ext}`;
    const up = await db.storage.from("generations").upload(path, bytes, { contentType, upsert: true });
    if (up.error) return NextResponse.json({ error: "storage" }, { status: 500 }); // provider retries
    await db
      .from("generations")
      .update({
        status: "complete",
        output_path: path,
        completed_at: new Date().toISOString(),
        expires_at: generationExpiry().toISOString(),
      })
      .eq("id", gen.id);
  } else {
    await db
      .from("generations")
      .update({
        status: event.status === "failed" ? "failed" : "processing",
        error: event.error ?? null,
      })
      .eq("id", gen.id);
  }
  return NextResponse.json({ ok: true });
}
