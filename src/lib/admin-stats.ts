/**
 * Numbers for the admin console, worked out from raw rows so they can be tested without a database: what the platform's
 * AI key cost (today, 7 and 30 days, average a day, a 14-day chart), and each person's usage and cost.
 */

export interface LedgerRow {
  user_id: string;
  created_at: string;
  key_source: "byok" | "server";
  cost_usd: number | string;
  cost_known?: boolean;
  job?: string;
}
export interface UsageRow {
  user_id: string;
  day: string;
  key: "runs" | "likeness";
  count: number;
}
export interface UserRow {
  id: string;
  email: string | null;
  created_at?: string | null;
  plan: "free" | "pro";
  is_admin: boolean;
  ownKey: boolean;
}

export interface UserStats extends UserRow {
  runsToday: number;
  likenessToday: number;
  runs7: number;
  likeness7: number;
  calls30: number;
  serverToday: number;
  server7: number;
  server30: number;
  ownKey30: number;
  lastActive: string | null;
}

export interface AdminStats {
  serverToday: number;
  server7: number;
  server30: number;
  avgPerDay7: number;
  avgPerDay30: number;
  projectedMonth: number;
  unpricedCalls30: number;
  activeToday: number;
  runsToday: number;
  daily: { day: string; cost: number; calls: number }[];
  users: UserStats[];
}

const DAY = 86_400_000;
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const num = (v: number | string) => (typeof v === "number" ? v : Number(v) || 0);

export function summarize(ledger: LedgerRow[], usage: UsageRow[], users: UserRow[], now = Date.now()): AdminStats {
  const today = utcDay(now);
  const days = Array.from({ length: 14 }, (_, i) => utcDay(now - (13 - i) * DAY));
  const since7 = utcDay(now - 6 * DAY);
  const since30 = utcDay(now - 29 * DAY);
  const daily = new Map(days.map((d) => [d, { day: d, cost: 0, calls: 0 }]));
  const per = new Map<string, UserStats>(
    users.map((u) => [u.id, { ...u, runsToday: 0, likenessToday: 0, runs7: 0, likeness7: 0, calls30: 0, serverToday: 0, server7: 0, server30: 0, ownKey30: 0, lastActive: null }]),
  );
  const row = (id: string) => {
    let s = per.get(id);
    if (!s) {
      s = { id, email: null, plan: "free", is_admin: false, ownKey: false, runsToday: 0, likenessToday: 0, runs7: 0, likeness7: 0, calls30: 0, serverToday: 0, server7: 0, server30: 0, ownKey30: 0, lastActive: null };
      per.set(id, s);
    }
    return s;
  };

  let serverToday = 0, server7 = 0, server30 = 0, unpriced = 0;
  for (const l of ledger) {
    const t = Date.parse(l.created_at);
    if (!Number.isFinite(t)) continue;
    const d = utcDay(t);
    if (d < since30) continue;
    const cost = num(l.cost_usd);
    const s = row(l.user_id);
    s.calls30++;
    if (!s.lastActive || l.created_at > s.lastActive) s.lastActive = l.created_at;
    if (l.key_source !== "server") {
      s.ownKey30 += cost;
      continue;
    }
    if (l.cost_known === false) unpriced++;
    server30 += cost;
    s.server30 += cost;
    if (d >= since7) {
      server7 += cost;
      s.server7 += cost;
    }
    if (d === today) {
      serverToday += cost;
      s.serverToday += cost;
    }
    const bar = daily.get(d);
    if (bar) {
      bar.cost += cost;
      bar.calls++;
    }
  }

  for (const u of usage) {
    if (u.day < since7) continue;
    const s = row(u.user_id);
    if (u.key === "runs") s.runs7 += u.count;
    else s.likeness7 += u.count;
    if (u.day === today) {
      if (u.key === "runs") s.runsToday += u.count;
      else s.likenessToday += u.count;
    }
  }

  const list = [...per.values()].sort((a, b) => b.server30 - a.server30 || b.runs7 - a.runs7 || (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
  const avgPerDay7 = server7 / 7;
  return {
    serverToday,
    server7,
    server30,
    avgPerDay7,
    avgPerDay30: server30 / 30,
    projectedMonth: avgPerDay7 * 30,
    unpricedCalls30: unpriced,
    activeToday: list.filter((u) => u.runsToday + u.likenessToday > 0 || u.serverToday > 0).length,
    runsToday: list.reduce((n, u) => n + u.runsToday, 0),
    daily: days.map((d) => daily.get(d)!),
    users: list,
  };
}
