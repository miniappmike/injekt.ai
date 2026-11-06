import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { entitlements } from "@/lib/entitlements";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { DailyLimitError } from "@/lib/errors";
import type { DailyKey } from "@/lib/limits";
import { getAppConfig } from "@/lib/app-config";

export interface DailySlot {
  /** Give the unit back, when the AI call failed and nothing was delivered. Safe to call twice. */
  release(): Promise<void>;
}
const NOOP: DailySlot = { release: async () => {} };

/** Whether the person has set up their own AI key for prompt writing (then nothing is counted against them). */
export async function hasOwnAiKey(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return !!effectiveRole(readRoles(data?.prefs), "vision");
}

// Before migration 0012 runs the functions don't exist; prompts keep working (uncounted) rather than all failing.
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883" || /consume_daily|release_daily|daily_usage/.test(e.message ?? ""));

/** Uses one unit of today's allowance, or throws DailyLimitError. Own-key and admin accounts aren't counted. */
export async function useDaily(supabase: SupabaseClient, userId: string, key: DailyKey): Promise<DailySlot> {
  if (await hasOwnAiKey(supabase, userId)) return NOOP;
  const plan = await entitlements.planOf(userId);
  if (plan === "admin") return NOOP;
  const { caps } = await getAppConfig();
  const limit = caps[plan][key];
  const { data, error } = await adminClient().rpc("consume_daily", { p_user: userId, p_key: key, p_limit: limit });
  if (error) {
    if (missing(error)) {
      console.warn("[limits] daily usage isn't set up yet (run migration 0012); not counting");
      return NOOP;
    }
    throw new Error("Couldn't check today's allowance. Try again.");
  }
  if (data !== true) throw new DailyLimitError(key, plan, limit, caps.pro[key]);
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await adminClient().rpc("release_daily", { p_user: userId, p_key: key });
    },
  };
}

/** Runs `fn` on one unit of today's allowance, given back if it fails. */
export async function withDaily<T>(supabase: SupabaseClient, userId: string, key: DailyKey, fn: () => Promise<T>): Promise<T> {
  const slot = await useDaily(supabase, userId, key);
  try {
    return await fn();
  } catch (e) {
    await slot.release().catch(() => {});
    throw e;
  }
}

export interface DailyStatus {
  plan: "free" | "pro" | "admin";
  ownKey: boolean;
  /** `limit` null: not counted (own key or admin). */
  runs: { used: number; limit: number | null };
  likeness: { used: number; limit: number | null };
}

/** Today's use, for the meter in the header. */
export async function dailyStatus(supabase: SupabaseClient, userId: string): Promise<DailyStatus> {
  const [ownKey, plan] = await Promise.all([hasOwnAiKey(supabase, userId), entitlements.planOf(userId)]);
  const counted = !ownKey && plan !== "admin";
  const used: Record<string, number> = {};
  if (counted) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("daily_usage").select("key, count").eq("user_id", userId).eq("day", today);
    for (const r of data ?? []) used[r.key as string] = r.count as number;
  }
  const limits = plan === "admin" ? null : (await getAppConfig()).caps[plan];
  return {
    plan,
    ownKey,
    runs: { used: used.runs ?? 0, limit: counted && limits ? limits.runs : null },
    likeness: { used: used.likeness ?? 0, limit: counted && limits ? limits.likeness : null },
  };
}
