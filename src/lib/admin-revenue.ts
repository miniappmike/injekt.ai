/**
 * Money received, for Admin → Orders. "Verified" means a payment provider confirmed it (Telegram Stars or
 * NOWPayments); orders marked paid by hand are counted separately. Pure functions, so they can be tested.
 */

/** What Telegram pays out per Star (approximately; Stars reach you as TON through Fragment). */
export const STAR_PAYOUT_USD = 0.013;

export const REVENUE_RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "all", label: "All time", days: null },
] as const;
export type RevenueRange = (typeof REVENUE_RANGES)[number]["id"];
export const parseRange = (v: unknown): RevenueRange => (REVENUE_RANGES.some((r) => r.id === v) ? (v as RevenueRange) : "30d");

export interface PaidOrder {
  paid_at: string;
  provider: string | null;
  amount_cents: number;
  amount_stars: number | null;
}

export interface RevenueBucket {
  /** The bucket's first day (YYYY-MM-DD). */
  start: string;
  label: string;
  crypto: number;
  telegram: number;
}

export interface Revenue {
  range: RevenueRange;
  /** Verified total in US dollars: crypto at its price, Telegram at the Stars payout. */
  total: number;
  crypto: number;
  telegram: number;
  telegramStars: number;
  /** Paid by hand (Admin → Mark paid), not counted in the total. */
  manual: number;
  orders: number;
  buckets: RevenueBucket[];
  unit: "day" | "week" | "month";
}

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (t: number) => new Date(new Date(t).toISOString().slice(0, 10) + "T00:00:00Z").getTime();

/** When the range begins, or null for all time. */
export function rangeStart(range: RevenueRange, now = Date.now()): Date | null {
  const days = REVENUE_RANGES.find((r) => r.id === range)?.days ?? null;
  return days === null ? null : new Date(startOfDay(now) - (days - 1) * DAY);
}

/** Totals and bar-chart buckets (days up to 30 days, weeks for 6 months, months for all time). */
export function summarizeRevenue(orders: PaidOrder[], range: RevenueRange, now = Date.now()): Revenue {
  const verified = orders.filter((o) => o.provider === "telegram" || o.provider === "nowpayments");
  const value = (o: PaidOrder) => (o.provider === "telegram" ? (o.amount_stars ?? 0) * STAR_PAYOUT_USD : o.amount_cents / 100);
  const crypto = verified.filter((o) => o.provider === "nowpayments").reduce((n, o) => n + value(o), 0);
  const telegram = verified.filter((o) => o.provider === "telegram").reduce((n, o) => n + value(o), 0);
  const telegramStars = verified.filter((o) => o.provider === "telegram").reduce((n, o) => n + (o.amount_stars ?? 0), 0);
  const manual = orders.filter((o) => o.provider !== "telegram" && o.provider !== "nowpayments").reduce((n, o) => n + o.amount_cents / 100, 0);

  const unit: Revenue["unit"] = range === "6m" ? "week" : range === "all" ? "month" : "day";
  const today = startOfDay(now);
  const starts: number[] = [];
  if (unit === "day") {
    const n = REVENUE_RANGES.find((r) => r.id === range)?.days ?? 30;
    for (let i = n - 1; i >= 0; i--) starts.push(today - i * DAY);
  } else if (unit === "week") {
    for (let i = 25; i >= 0; i--) starts.push(today - (i * 7 + 6) * DAY);
  } else {
    const first = verified.length ? Math.min(...verified.map((o) => Date.parse(o.paid_at))) : now;
    const d = new Date(first);
    let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const last = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
    // At least 6 months on screen, so a new site's chart isn't one fat bar.
    const min = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 5, 1);
    if (m > min) m = min;
    while (m <= last) {
      starts.push(m);
      const x = new Date(m);
      m = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1);
    }
  }
  const label = (t: number) => {
    const d = new Date(t);
    return unit === "month"
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const buckets: RevenueBucket[] = starts.map((t) => ({ start: ymd(new Date(t)), label: label(t), crypto: 0, telegram: 0 }));
  for (const o of verified) {
    const t = Date.parse(o.paid_at);
    let i = -1;
    for (let k = starts.length - 1; k >= 0; k--) {
      if (t >= starts[k]) {
        i = k;
        break;
      }
    }
    if (i < 0) continue;
    if (o.provider === "telegram") buckets[i].telegram += value(o);
    else buckets[i].crypto += value(o);
  }
  return { range, total: crypto + telegram, crypto, telegram, telegramStars, manual, orders: verified.length, buckets, unit };
}
