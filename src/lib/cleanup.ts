import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Refuses everything when no secret is set. */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Deletes the files of generations past expires_at and clears their output_path. The rows stay so usage
// history is kept. If deleting files fails nothing is cleared, so the next run tries again.
export async function cleanupExpiredGenerations(
  db: SupabaseClient,
  now: Date = new Date(),
  batchSize = 200,
  maxBatches = 10,
): Promise<{ removed: number }> {
  let removed = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { data, error } = await db
      .from("generations")
      .select("id, output_path")
      .not("output_path", "is", null)
      .lte("expires_at", now.toISOString())
      .limit(batchSize);
    if (error) throw new Error("Could not list expired generations");
    if (!data?.length) break;

    const { error: removeError } = await db.storage.from("generations").remove(data.map((r) => r.output_path as string));
    if (removeError) throw new Error("Could not delete expired files");
    const { error: clearError } = await db
      .from("generations")
      .update({ output_path: null })
      .in("id", data.map((r) => r.id));
    if (clearError) throw new Error("Could not mark generations as expired");
    removed += data.length;
    if (data.length < batchSize) break;
  }
  return { removed };
}
