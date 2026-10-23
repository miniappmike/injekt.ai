import "server-only";
import { adminClient } from "./supabase/admin";
import { createEntitlements } from "./entitlements-core";
import type { AllowanceKey } from "./limits";

export { isEmailVerified } from "./entitlements-core";

// Counters and plans are only writable with the service role, so this is the one place that touches them.
export const entitlements = createEntitlements({
  async getProfile(userId) {
    const { data } = await adminClient().from("profiles").select("plan, is_admin").eq("id", userId).maybeSingle();
    return data ? { plan: data.plan === "pro" ? "pro" : "free", is_admin: data.is_admin === true } : null;
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
