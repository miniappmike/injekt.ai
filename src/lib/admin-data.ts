import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { summarize, type LedgerRow, type UsageRow, type UserRow } from "@/lib/admin-stats";

const DAY = 86_400_000;

/** Everything the admin console shows, read with the service role (the page checks the viewer is an admin first). */
export async function loadAdminStats() {
  const db = adminClient();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const [ledger, usage, profiles, settings, auth] = await Promise.all([
    db.from("api_ledger").select("user_id, created_at, key_source, cost_usd, cost_known, job").gte("created_at", since30).limit(50000),
    // Missing before migration 0012: the console still shows spend.
    db.from("daily_usage").select("user_id, day, key, count").gte("day", since7).limit(50000),
    db.from("profiles").select("id, plan, is_admin, created_at").limit(5000),
    db.from("user_settings").select("user_id, prefs").limit(5000),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((auth.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const ownKey = new Set((settings.data ?? []).filter((s) => !!effectiveRole(readRoles(s.prefs), "vision")).map((s) => s.user_id as string));
  const users: UserRow[] = (profiles.data ?? []).map((p) => ({
    id: p.id as string,
    email: emails.get(p.id as string) ?? null,
    created_at: p.created_at as string,
    plan: p.plan === "pro" ? "pro" : "free",
    is_admin: p.is_admin === true,
    ownKey: ownKey.has(p.id as string),
  }));
  return {
    stats: summarize((ledger.data ?? []) as LedgerRow[], (usage.data ?? []) as UsageRow[], users),
    usageMissing: !!usage.error,
  };
}
