import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { checkRow } from "@/lib/ledger-settle";

type Pending = { id: number; user_id: string; key_source: "byok" | "server"; job: "vision" | "llm" | "image"; provider_task_ids: string[] };

export interface SweepResult {
  /** Rows looked at. */
  checked: number;
  settled: number;
  /** SpicyAPI hasn't finalised these charges yet. */
  held: number;
  /** Couldn't be read: no key any more, a different key, or SpicyAPI doesn't know the task. */
  unreadable: number;
}

/**
 * Settles recent rows still waiting for their final charge, with the key that made each call. Runs in the daily
 * cleanup, and when the Admin page (everyone) or the Ledger page (that person's rows) opens. A few lookups run at once,
 * and it stops when `budgetMs` is used up so a page never waits long.
 */
export async function settlePendingLedger(
  db: SupabaseClient,
  o: { limit?: number; userId?: string; budgetMs?: number; concurrency?: number } = {},
): Promise<SweepResult> {
  const { limit = 300, userId, budgetMs = 50_000, concurrency = 6 } = o;
  const started = Date.now();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  let q = db
    .from("api_ledger")
    .select("id, user_id, key_source, job, provider_task_ids")
    .eq("cost_settled", false)
    .not("provider_task_ids", "is", null)
    .gte("created_at", since)
    .order("id", { ascending: false })
    .limit(limit);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  const result: SweepResult = { checked: 0, settled: 0, held: 0, unreadable: 0 };
  if (error || !data?.length) return result;

  const keys = new Map<string, Promise<string | null>>();
  const keyFor = (r: Pending): Promise<string | null> => {
    if (r.key_source === "server") return Promise.resolve(env.SPICY_API_KEY ?? null);
    const k = `${r.user_id}:${r.job}`;
    if (!keys.has(k)) {
      keys.set(
        k,
        (async () => {
          try {
            const { data: s } = await db.from("user_settings").select("prefs").eq("user_id", r.user_id).maybeSingle();
            const chosen = effectiveRole(readRoles(s?.prefs), r.job);
            return chosen ? (await resolveApiKey(keyResolverDeps, r.user_id, chosen.cfg.provider, chosen.keyRole)).key : null;
          } catch {
            return null;
          }
        })(),
      );
    }
    return keys.get(k)!;
  };

  const rows = data as Pending[];
  let next = 0;
  const worker = async () => {
    while (next < rows.length && Date.now() - started < budgetMs) {
      const r = rows[next++];
      result.checked++;
      const key = await keyFor(r);
      const outcome = key ? await checkRow(db, r.id, key, r.provider_task_ids).catch(() => "unreadable" as const) : "unreadable";
      result[outcome]++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}
