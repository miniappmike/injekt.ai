import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { entitlements, loadProfile } from "@/lib/entitlements";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { DailyLimitError } from "@/lib/errors";
import type { DailyKey } from "@/lib/limits";
import { getAppConfig } from "@/lib/app-config";
import { creditBalance, NO_SPEND, spendCredits, type CreditSpend } from "@/lib/credits";
import { PROMPT_CREDITS } from "@/lib/plans";

export interface DailySlot {
  /** Give the unit back, when the AI call failed and nothing was delivered. Safe to call twice. */
  release(): Promise<void>;
}
const NOOP: DailySlot = { release: async () => {} };

/**
 * Whether their own AI key does the prompt writing (then nothing is counted or charged). Own keys are a Pro feature:
 * on the free plan a saved key is ignored and the platform's key is used.
 */
export async function hasOwnAiKey(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!(await canUseOwnKeys(userId))) return false;
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return !!effectiveRole(readRoles(data?.prefs), "vision");
}

/** Own keys (BYOK) come with Pro (and admins). */
export async function canUseOwnKeys(userId: string): Promise<boolean> {
  return (await entitlements.planOf(userId)) !== "free";
}

// Before migration 0012 runs the functions don't exist; prompts keep working (uncounted) rather than all failing.
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883" || /consume_daily|release_daily|daily_usage/.test(e.message ?? "")) || (!!e && e.code === "23514");

/** Uses one unit of today's allowance, or throws DailyLimitError. Only free accounts have daily limits. */
export async function useDaily(supabase: SupabaseClient, userId: string, key: DailyKey): Promise<DailySlot> {
  const plan = await entitlements.planOf(userId);
  if (plan !== "free") return NOOP;
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

/**
 * Runs `fn` on one unit of today's allowance (free plan), given back if it fails. A prompt run on the platform's key
 * also costs PROMPT_CREDITS, given back the same way; with their own key (Pro) it costs nothing.
 */
export async function withDaily<T>(supabase: SupabaseClient, userId: string, key: DailyKey, fn: () => Promise<T>): Promise<T> {
  const slot = await useDaily(supabase, userId, key);
  let spend: CreditSpend = NO_SPEND;
  try {
    if (key === "runs" && !(await hasOwnAiKey(supabase, userId))) spend = await spendCredits(userId, PROMPT_CREDITS, "prompt");
    return await fn();
  } catch (e) {
    await slot.release().catch(() => {});
    await spend.refund().catch(() => {});
    throw e;
  }
}

export interface DailyStatus {
  plan: "free" | "pro" | "admin";
  ownKey: boolean;
  /** `limit` null: not counted (Pro, admin). */
  runs: { used: number; limit: number | null };
  likeness: { used: number; limit: number | null };
  images: { used: number; limit: number | null };
  /** Credits they can spend now; null before migration 0023. */
  credits: number | null;
  /** When the Pro pass ends (null: no pass, or Pro set by hand). */
  proUntil: string | null;
}

/** Today's use, credits and plan, for the meter in the header. Gives the free credits on the first look once the email is confirmed. */
export async function dailyStatus(supabase: SupabaseClient, userId: string, opts: { emailConfirmed?: boolean } = {}): Promise<DailyStatus> {
  const [ownKey, plan, profile, credits] = await Promise.all([
    hasOwnAiKey(supabase, userId),
    entitlements.planOf(userId),
    loadProfile(userId),
    creditBalance(userId, opts).catch(() => null),
  ]);
  const counted = plan === "free";
  const used: Record<string, number> = {};
  if (counted) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("daily_usage").select("key, count").eq("user_id", userId).eq("day", today);
    for (const r of data ?? []) used[r.key as string] = r.count as number;
  }
  const limits = counted ? (await getAppConfig()).caps.free : null;
  return {
    plan,
    ownKey,
    runs: { used: used.runs ?? 0, limit: limits ? limits.runs : null },
    likeness: { used: used.likeness ?? 0, limit: limits ? limits.likeness : null },
    images: { used: used.images ?? 0, limit: limits ? limits.images : null },
    credits,
    proUntil: profile?.proUntil ?? null,
  };
}
