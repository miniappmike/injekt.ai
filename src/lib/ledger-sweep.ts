import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { settleRow } from "@/lib/ledger-settle";

type Pending = { id: number; user_id: string; key_source: "byok" | "server"; job: "vision" | "llm" | "image"; provider_task_ids: string[] };

/** The daily sweep: settles recent rows still waiting for their final charge, with the key that made each call. */
export async function settlePendingLedger(db: SupabaseClient, limit = 300): Promise<{ settled: number; pending: number }> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("api_ledger")
    .select("id, user_id, key_source, job, provider_task_ids")
    .eq("cost_settled", false)
    .not("provider_task_ids", "is", null)
    .gte("created_at", since)
    .order("id", { ascending: true })
    .limit(limit);
  if (error || !data?.length) return { settled: 0, pending: 0 };

  const keys = new Map<string, string | null>();
  const keyFor = async (r: Pending): Promise<string | null> => {
    if (r.key_source === "server") return env.SPICY_API_KEY ?? null;
    const k = `${r.user_id}:${r.job}`;
    if (!keys.has(k)) {
      try {
        const { data: s } = await db.from("user_settings").select("prefs").eq("user_id", r.user_id).maybeSingle();
        const chosen = effectiveRole(readRoles(s?.prefs), r.job);
        keys.set(k, chosen ? (await resolveApiKey(keyResolverDeps, r.user_id, chosen.cfg.provider, chosen.keyRole)).key : null);
      } catch {
        keys.set(k, null);
      }
    }
    return keys.get(k) ?? null;
  };

  let settled = 0;
  for (const r of data as Pending[]) {
    const key = await keyFor(r);
    if (key && (await settleRow(db, r.id, key, r.provider_task_ids).catch(() => false))) settled++;
  }
  return { settled, pending: data.length - settled };
}
