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

/** One ledger row as the finance view reads it. */
export interface FinanceRow {
  user_id: string;
  created_at: string;
  key_source: "byok" | "server";
  platform?: string;
  job?: string;
  feature?: string;
  model?: string | null;
  status?: "succeeded" | "failed";
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd: number | string;
  cost_known?: boolean;
  cost_source?: string | null;
  cost_settled?: boolean;
  generation_id?: string | null;
}

export interface ImageCostRow {
  model: string;
  size: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  /** How many of them have SpicyAPI's final charge (the rest are the amount held, the most it can charge). */
  settled: number;
}
export interface TextCostRow {
  feature: string;
  model: string;
  calls: number;
  avgIn: number;
  avgOut: number;
  avgCost: number;
  total: number;
  /** How many have the provider's real charge (the rest are tokens x list price). */
  real: number;
}
export interface FinanceStats {
  total30: number;
  byok30: number;
  server30: number;
  people30: number;
  textCalls30: number;
  tokensIn30: number;
  tokensOut30: number;
  textCost30: number;
  images30: number;
  failedImages30: number;
  imageCost30: number;
  avgImage: number;
  /** Share of all calls whose cost is the provider's final charge. */
  realShare: number;
  images: ImageCostRow[];
  text: TextCostRow[];
  /** What a model's text calls really cost per million tokens, fitted from the settled charges. */
  measured: { model: string; input: number; output: number; calls: number }[];
}

/**
 * Real costs of the platform's own SpicyAPI key over the last 30 days, for pricing on-site credits: only calls the
 * platform's key paid for (key_source "server"), plus, when `alsoUsers` is given, those people's calls on their own
 * keys (the admins' own testing). People who bring their own keys are never counted.
 * `sizes` maps a generation id to its image size (1k, 1.5k, 2k).
 */
export function finances(rows: FinanceRow[], sizes: Map<string, string>, now = Date.now(), alsoUsers: ReadonlySet<string> = new Set()): FinanceStats {
  const since = now - 30 * DAY;
  let total30 = 0, byok30 = 0, server30 = 0, textCalls30 = 0, tokensIn30 = 0, tokensOut30 = 0, textCost30 = 0;
  let images30 = 0, failedImages30 = 0, imageCost30 = 0, pricedImages = 0, real = 0, n = 0;
  const people = new Set<string>();
  const img = new Map<string, ImageCostRow>();
  const txt = new Map<string, TextCostRow & { inSum: number; outSum: number }>();
  const fit = new Map<string, { sxx: number; sxy: number; syy: number; sxc: number; syc: number; n: number }>();

  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t) || t < since) continue;
    if (r.key_source !== "server" && !alsoUsers.has(r.user_id)) continue;
    const cost = num(r.cost_usd);
    const isReal = r.cost_source === "provider" && (r.job !== "image" || r.cost_settled !== false);
    n++;
    if (isReal) real++;
    people.add(r.user_id);
    total30 += cost;
    if (r.key_source === "server") server30 += cost;
    else byok30 += cost;
    const model = r.model ?? "unknown";

    if (r.job === "image") {
      if (r.status === "failed") {
        failedImages30++;
        imageCost30 += cost;
        continue;
      }
      images30++;
      imageCost30 += cost;
      if (r.cost_known === false) continue;
      pricedImages++;
      const size = (r.generation_id && sizes.get(r.generation_id)) || "?";
      const k = `${model}|${size}`;
      const g = img.get(k) ?? { model, size, count: 0, avg: 0, min: Infinity, max: 0, settled: 0 };
      g.count++;
      g.avg += cost; // a sum until the end
      g.min = Math.min(g.min, cost);
      g.max = Math.max(g.max, cost);
      if (r.cost_settled) g.settled++;
      img.set(k, g);
      continue;
    }

    textCalls30++;
    const tin = r.input_tokens ?? 0;
    const tout = r.output_tokens ?? 0;
    tokensIn30 += tin;
    tokensOut30 += tout;
    textCost30 += cost;
    const feature = r.feature ?? "other";
    const k = `${feature}|${model}`;
    const g = txt.get(k) ?? { feature, model, calls: 0, avgIn: 0, avgOut: 0, avgCost: 0, total: 0, real: 0, inSum: 0, outSum: 0 };
    g.calls++;
    g.inSum += tin;
    g.outSum += tout;
    g.total += cost;
    if (isReal) g.real++;
    txt.set(k, g);
    // Settled charges with token counts are what the per-million price is fitted from.
    if (isReal && (tin || tout)) {
      const f = fit.get(model) ?? { sxx: 0, sxy: 0, syy: 0, sxc: 0, syc: 0, n: 0 };
      const x = tin / 1e6, y = tout / 1e6;
      f.sxx += x * x; f.sxy += x * y; f.syy += y * y; f.sxc += x * cost; f.syc += y * cost; f.n++;
      fit.set(model, f);
    }
  }

  const measured: FinanceStats["measured"] = [];
  for (const [model, f] of fit) {
    const det = f.sxx * f.syy - f.sxy * f.sxy;
    if (f.n < 5 || det <= 0) continue;
    const input = (f.sxc * f.syy - f.syc * f.sxy) / det;
    const output = (f.syc * f.sxx - f.sxc * f.sxy) / det;
    if (input >= 0 && output >= 0) measured.push({ model, input, output, calls: f.n });
  }

  return {
    total30,
    byok30,
    server30,
    people30: people.size,
    textCalls30,
    tokensIn30,
    tokensOut30,
    textCost30,
    images30,
    failedImages30,
    imageCost30,
    avgImage: pricedImages ? [...img.values()].reduce((s, g) => s + g.avg, 0) / pricedImages : 0,
    realShare: n ? real / n : 0,
    images: [...img.values()].map((g) => ({ ...g, avg: g.avg / g.count })).sort((a, b) => b.count - a.count),
    text: [...txt.values()]
      .map(({ inSum, outSum, ...g }) => ({ ...g, avgIn: inSum / g.calls, avgOut: outSum / g.calls, avgCost: g.total / g.calls }))
      .sort((a, b) => b.total - a.total),
    measured: measured.sort((a, b) => b.calls - a.calls),
  };
}
