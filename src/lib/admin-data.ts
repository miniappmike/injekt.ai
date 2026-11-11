import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { finances, summarize, type FinanceRow, type LedgerRow, type UsageRow, type UserRow } from "@/lib/admin-stats";

const DAY = 86_400_000;

/** Everything the admin console shows, read with the service role (the page checks the viewer is an admin first). */
export async function loadAdminStats() {
  const db = adminClient();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  // Every call by everyone over 30 days. cost_settled comes with migration 0021; without it, read the rest.
  const cols = "user_id, created_at, key_source, platform, job, feature, model, status, input_tokens, output_tokens, cost_usd, cost_known, cost_source, generation_id";
  const readLedger = async () => {
    const full = await db.from("api_ledger").select(`${cols}, cost_settled`).gte("created_at", since30).order("id").limit(50000);
    return full.error ? db.from("api_ledger").select(cols).gte("created_at", since30).order("id").limit(50000) : full;
  };
  const [ledger, usage, profiles, settings, auth] = await Promise.all([
    readLedger(),
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
  const rows = (ledger.data ?? []) as unknown as FinanceRow[];
  // Image sizes come from each generation's settings.
  const genIds = [...new Set(rows.filter((r) => r.job === "image" && r.generation_id).map((r) => r.generation_id as string))];
  const sizes = new Map<string, string>();
  for (let i = 0; i < genIds.length; i += 300) {
    const { data } = await db.from("generations").select("id, params").in("id", genIds.slice(i, i + 300));
    for (const g of data ?? []) {
      const res = (g.params as { resolution?: unknown } | null)?.resolution;
      if (typeof res === "string") sizes.set(g.id as string, res);
    }
  }
  return {
    stats: summarize(rows as unknown as LedgerRow[], (usage.data ?? []) as UsageRow[], users),
    // Only the platform key's own usage; the second view adds the admins' own testing on their saved keys.
    finance: finances(rows, sizes),
    financeWithAdmins: finances(rows, sizes, Date.now(), new Set(users.filter((u) => u.is_admin).map((u) => u.id))),
    usageMissing: !!usage.error,
  };
}
