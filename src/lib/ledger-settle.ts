import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spicyTaskCost } from "@/lib/ai/providers/spicyapi";

/**
 * Real costs on the ledger. SpicyAPI charges every call (chat completions too) as a task, and the task's record holds
 * the final charge once it is settled. A text call is written with tokens x the list price and an image with the
 * amount held for it. Both are replaced here with what SpicyAPI actually charged, right after the call (settleSoon)
 * and again in the daily cleanup (settlePendingLedger in ledger-sweep) for any that weren't settled yet.
 */

/** Looks up a row's tasks and, once every one is settled, writes their total as its cost. True when settled. */
export async function settleRow(db: SupabaseClient, id: number, apiKey: string, taskIds: string[]): Promise<boolean> {
  if (!taskIds.length) return false;
  const records = await Promise.all(taskIds.map((t) => spicyTaskCost(apiKey, t)));
  if (records.some((r) => !r || !r.settled)) return false;
  const total = Math.round(records.reduce((n, r) => n + r!.cost, 0) * 1e6) / 1e6;
  const { error } = await db
    .from("api_ledger")
    .update({ cost_usd: total, cost_known: true, cost_source: "provider", cost_settled: true })
    .eq("id", id);
  return !error;
}

const SETTLE_DELAYS_MS = [1500, 4000, 10000];

/** After the response is sent, tries to settle a row a few times while the provider finishes billing it. */
export function settleSoon(db: SupabaseClient, id: number, apiKey: string, taskIds: string[]) {
  const run = async () => {
    for (const wait of SETTLE_DELAYS_MS) {
      await new Promise((r) => setTimeout(r, wait));
      if (await settleRow(db, id, apiKey, taskIds).catch(() => false)) return;
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (tests, scripts): the daily cleanup settles it instead.
  }
}
