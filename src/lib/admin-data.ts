import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { effectiveRole, readRoles } from "@/lib/ai/roles";
import { STAR_PAYOUT_USD, type PaidOrder } from "@/lib/admin-revenue";
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
    db.from("profiles").select("id, plan, is_admin, created_at, pro_until").limit(5000),
    db.from("user_settings").select("user_id, prefs").limit(5000),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((auth.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const ownKey = new Set((settings.data ?? []).filter((s) => !!effectiveRole(readRoles(s.prefs), "vision")).map((s) => s.user_id as string));
  const users: UserRow[] = (profiles.data ?? []).map((p) => ({
    id: p.id as string,
    email: emails.get(p.id as string) ?? null,
    created_at: p.created_at as string,
    // Pro set by hand, or a Pro pass that hasn't ended.
    plan: p.plan === "pro" || (!!p.pro_until && Date.parse(p.pro_until as string) > Date.now()) ? "pro" : "free",
    is_admin: p.is_admin === true,
    ownKey: ownKey.has(p.id as string),
    proUntil: (p.pro_until as string | null) ?? null,
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

/** Per person: tokens they can spend, what they've paid (verified), and how many paid orders. For Admin → People. */
export async function loadPeopleExtras(): Promise<Record<string, { tokens: number; paidUsd: number; paidOrders: number }>> {
  const db = adminClient();
  const now = new Date().toISOString();
  const [lots, orders] = await Promise.all([
    db.from("credit_lots").select("user_id, remaining, expires_at").gt("remaining", 0).limit(50000),
    db.from("orders").select("user_id, provider, amount_cents, amount_stars").eq("status", "paid").limit(50000),
  ]);
  const out: Record<string, { tokens: number; paidUsd: number; paidOrders: number }> = {};
  const row = (id: string) => (out[id] ??= { tokens: 0, paidUsd: 0, paidOrders: 0 });
  for (const l of lots.data ?? []) if (!l.expires_at || (l.expires_at as string) > now) row(l.user_id as string).tokens += l.remaining as number;
  for (const o of orders.data ?? []) {
    if (!o.user_id || (o.provider !== "telegram" && o.provider !== "nowpayments")) continue;
    const r = row(o.user_id as string);
    r.paidOrders++;
    r.paidUsd += o.provider === "telegram" ? ((o.amount_stars as number | null) ?? 0) * STAR_PAYOUT_USD : (o.amount_cents as number) / 100;
  }
  return out;
}

/** Paid orders since a date (all time when null), for the revenue chart. */
export async function loadPaidOrders(since: Date | null): Promise<PaidOrder[]> {
  let q = adminClient().from("orders").select("paid_at, provider, amount_cents, amount_stars").eq("status", "paid").not("paid_at", "is", null);
  if (since) q = q.gte("paid_at", since.toISOString());
  const { data } = await q.order("paid_at").limit(50000);
  return (data ?? []) as PaidOrder[];
}

export interface PersonDetail {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  plan: "free" | "pro";
  isAdmin: boolean;
  proUntil: string | null;
  tokens: { total: number; monthly: number; bought: number; free: number; added: number };
  orders: { id: string; created_at: string; kind: string; credits: number; amount_cents: number; amount_stars: number | null; status: string; provider: string | null }[];
  activity: { at: string; delta: number; label: string }[];
  ledger: { at: string; feature: string | null; model: string | null; status: string | null; cost: number | null; settled: boolean }[];
  ledger30: number;
}

const LOT_LABELS: Record<string, string> = { signup: "Free tokens", pro: "Pro month", topup: "Token pack", admin: "Added by admin" };

/** One person, for Admin → People → their page: plan, tokens, orders, token activity, and calls on your key. */
export async function loadPerson(id: string): Promise<PersonDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = adminClient();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const [{ data: auth }, { data: profile }, lots, spends, orders, ledger] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from("profiles").select("plan, is_admin, pro_until").eq("id", id).maybeSingle(),
    db.from("credit_lots").select("source, amount, remaining, expires_at, created_at, note").eq("user_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("credit_spends").select("amount, reason, created_at, refunded_at").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("orders").select("id, created_at, kind, credits, amount_cents, amount_stars, status, provider").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("api_ledger").select("created_at, feature, model, status, cost_usd, cost_settled").eq("user_id", id).eq("key_source", "server").order("created_at", { ascending: false }).limit(100),
  ]);
  if (!auth?.user || !profile) return null;
  const now = new Date().toISOString();
  const live = (lots.data ?? []).filter((l) => (l.remaining as number) > 0 && (!l.expires_at || (l.expires_at as string) > now));
  const sum = (src: string) => live.filter((l) => l.source === src).reduce((n, l) => n + (l.remaining as number), 0);
  const proUntil = (profile.pro_until as string | null) ?? null;
  const activity = [
    ...(lots.data ?? []).map((l) => ({ at: l.created_at as string, delta: l.amount as number, label: `${LOT_LABELS[l.source as string] ?? "Tokens"}${l.note ? ` (${l.note})` : ""}` })),
    ...(spends.data ?? []).map((x) => ({
      at: x.created_at as string,
      delta: x.refunded_at ? 0 : -(x.amount as number),
      label: `${String(x.reason).startsWith("admin") ? "Removed by admin" : String(x.reason).startsWith("image:") ? "Image" : x.reason === "prompt" ? "Prompt" : x.reason === "profile" ? "Profile build" : String(x.reason)}${x.refunded_at ? " · refunded" : ""}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
  const ledgerRows = (ledger.data ?? []).map((l) => ({
    at: l.created_at as string,
    feature: (l.feature as string | null) ?? null,
    model: (l.model as string | null) ?? null,
    status: (l.status as string | null) ?? null,
    cost: l.cost_usd === null ? null : Number(l.cost_usd),
    settled: l.cost_settled === true,
  }));
  return {
    id,
    email: auth.user.email ?? null,
    createdAt: auth.user.created_at ?? null,
    lastSignIn: auth.user.last_sign_in_at ?? null,
    plan: profile.plan === "pro" || (!!proUntil && Date.parse(proUntil) > Date.now()) ? "pro" : "free",
    isAdmin: profile.is_admin === true,
    proUntil,
    tokens: { total: live.reduce((n, l) => n + (l.remaining as number), 0), monthly: sum("pro"), bought: sum("topup"), free: sum("signup"), added: sum("admin") },
    orders: (orders.data ?? []) as PersonDetail["orders"],
    activity,
    ledger: ledgerRows,
    ledger30: ledgerRows.filter((l) => l.at >= since30).reduce((n, l) => n + (l.cost ?? 0), 0),
  };
}
