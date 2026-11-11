import "server-only";
import { adminClient } from "./supabase/admin";
import { createEntitlements } from "./entitlements-core";
import type { AllowanceKey } from "./limits";

export { isEmailVerified } from "./entitlements-core";

/**
 * The account's plan row. Pro is either set by hand on the admin page (`plan`) or a paid 30-day pass (`pro_until`).
 * Before migration 0023 there is no pro_until column, so that read falls back to the old columns.
 */
export async function loadProfile(userId: string): Promise<{ is_admin: boolean; pro: boolean; manualPro: boolean; proUntil: string | null } | null> {
  const db = adminClient();
  let { data, error } = await db.from("profiles").select("plan, is_admin, pro_until").eq("id", userId).maybeSingle();
  if (error && /pro_until/.test(error.message)) ({ data, error } = await db.from("profiles").select("plan, is_admin").eq("id", userId).maybeSingle());
  if (!data) return null;
  const row = data as { plan?: string; is_admin?: boolean; pro_until?: string | null };
  const proUntil = row.pro_until ?? null;
  const manualPro = row.plan === "pro";
  return { is_admin: row.is_admin === true, manualPro, proUntil, pro: manualPro || (!!proUntil && new Date(proUntil).getTime() > Date.now()) };
}

// Counters and plans are only writable with the service role, so this is the one place that touches them.
export const entitlements = createEntitlements({
  async getProfile(userId) {
    const p = await loadProfile(userId);
    return p ? { plan: p.pro ? "pro" : "free", is_admin: p.is_admin } : null;
  },
  async consume(userId, key, limit) {
    const { data, error } = await adminClient().rpc("consume_allowance", { p_user: userId, p_key: key, p_limit: limit });
    if (error) throw new Error("Could not check your plan limits. Try again.");
    return data === true;
  },
  async release(userId, key) {
    await adminClient().rpc("release_allowance", { p_user: userId, p_key: key });
  },
  async getUsage(userId) {
    const { data } = await adminClient().from("usage_counters").select("key, count").eq("user_id", userId);
    const out: Partial<Record<AllowanceKey, number>> = {};
    for (const row of data ?? []) out[row.key as AllowanceKey] = row.count;
    return out;
  },
});
