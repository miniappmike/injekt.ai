import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPending, GENERATIONS_BUCKET, type Actor } from "@/lib/generation";
import { featureLabel } from "@/lib/ledger-types";
import { timeLeft } from "@/lib/retention";
import type { GenerationItem } from "@/lib/history-types";

type Row = {
  id: string;
  kind: string;
  status: string;
  model: string | null;
  prompt: string | null;
  error: string | null;
  output_path: string | null;
  created_at: string;
  expires_at: string | null;
  cost_usd: string | number | null;
  params: { free?: boolean } | null;
};

/** Where a generation is in its life. A finished image past its 72 hours (or whose file is gone) counts as expired. */
export function generationState(row: Pick<Row, "status" | "output_path" | "expires_at">, now = new Date()): GenerationItem["state"] {
  if (row.status === "failed") return "failed";
  if (row.status === "complete") return row.output_path && row.expires_at && !timeLeft(row.expires_at, now).expired ? "ready" : "expired";
  return "generating";
}

const COLUMNS = "id, kind, status, model, prompt, error, output_path, created_at, expires_at, cost_usd, params";

// The person's newest images. First finishes any job that completed while they were away, so it shows up as ready.
export async function listGenerations(supabase: SupabaseClient, user: Actor, limit = 50): Promise<GenerationItem[]> {
  await collectPending(supabase, user);
  const { data } = await supabase.from("generations").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as Row[];

  // Links only for images that are still there, and they stop working when the image does.
  const storage = supabase.storage.from(GENERATIONS_BUCKET);
  const links = new Map<string, { view: string; save: string }>();
  await Promise.all(
    rows
      .filter((r) => generationState(r) === "ready")
      .map(async (r) => {
        const ttl = Math.max(60, Math.min(3600, Math.floor((new Date(r.expires_at as string).getTime() - Date.now()) / 1000)));
        const [view, save] = await Promise.all([
          storage.createSignedUrl(r.output_path as string, ttl),
          storage.createSignedUrl(r.output_path as string, ttl, { download: true }),
        ]);
        if (view.data && save.data) links.set(r.id, { view: view.data.signedUrl, save: save.data.signedUrl });
      }),
  );

  return rows.map((r) => {
    const state = generationState(r);
    const linked = links.get(r.id);
    const finished = state !== "generating";
    const cost = r.cost_usd === null || r.cost_usd === undefined ? null : Number(r.cost_usd);
    return {
      id: r.id,
      kindLabel: featureLabel(`image:${r.kind}`),
      model: r.model,
      prompt: r.prompt,
      // A file whose link could not be made is treated as unavailable rather than shown broken.
      state: state === "ready" && !linked ? "expired" : state,
      error: r.error,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      costUsd: finished && cost !== null && Number.isFinite(cost) ? cost : null,
      free: r.params?.free === true,
      previewUrl: linked?.view ?? null,
      downloadUrl: linked?.save ?? null,
    };
  });
}
