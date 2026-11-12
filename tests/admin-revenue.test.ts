import { describe, expect, it, vi } from "vitest";
import { rangeStart, STAR_PAYOUT_USD, summarizeRevenue } from "@/lib/admin-revenue";

vi.mock("server-only", () => ({}));
import { cleanupStaleOrders } from "@/lib/cleanup";

const NOW = Date.parse("2026-11-12T15:00:00Z");
const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

describe("verified revenue", () => {
  const orders = [
    { paid_at: at(0), provider: "nowpayments", amount_cents: 1000, amount_stars: 500 },
    { paid_at: at(1), provider: "telegram", amount_cents: 999, amount_stars: 500 },
    { paid_at: at(3), provider: "nowpayments", amount_cents: 2500, amount_stars: 1500 },
    { paid_at: at(2), provider: "admin", amount_cents: 5000, amount_stars: 2500 }, // marked paid by hand
    { paid_at: at(40), provider: "nowpayments", amount_cents: 10000, amount_stars: 5000 }, // outside 7 days
  ];

  it("counts crypto at its price and Telegram at the Stars payout; hand-marked orders apart", () => {
    const r = summarizeRevenue(orders.filter((o) => Date.parse(o.paid_at) >= rangeStart("7d", NOW)!.getTime()), "7d", NOW);
    expect(r.crypto).toBe(35);
    expect(r.telegram).toBeCloseTo(500 * STAR_PAYOUT_USD);
    expect(r.total).toBeCloseTo(35 + 6.5);
    expect(r.telegramStars).toBe(500);
    expect(r.manual).toBe(50);
    expect(r.orders).toBe(3);
  });

  it("puts each payment in the right bar: days, weeks or months", () => {
    const d = summarizeRevenue(orders, "7d", NOW);
    expect(d.unit).toBe("day");
    expect(d.buckets).toHaveLength(7);
    expect(d.buckets.at(-1)?.crypto).toBe(10); // today
    expect(d.buckets.at(-2)?.telegram).toBeCloseTo(6.5); // yesterday
    expect(d.buckets.at(-4)?.crypto).toBe(25);
    expect(d.buckets.reduce((n, b) => n + b.crypto + b.telegram, 0)).toBeCloseTo(41.5); // the 40-day-old one isn't in a 7-day chart

    const w = summarizeRevenue(orders, "6m", NOW);
    expect(w.unit).toBe("week");
    expect(w.buckets).toHaveLength(26);
    expect(w.buckets.at(-1)!.crypto).toBe(35); // the last 7 days
    expect(w.buckets.reduce((n, b) => n + b.crypto, 0)).toBe(135);

    const m = summarizeRevenue(orders, "all", NOW);
    expect(m.unit).toBe("month");
    expect(m.buckets.length).toBeGreaterThanOrEqual(6);
    expect(m.buckets.at(-1)!.label).toMatch(/Nov/);
    expect(m.buckets.reduce((n, b) => n + b.crypto + b.telegram, 0)).toBeCloseTo(141.5);
  });

  it("all time has no start; 30 days starts 29 days before today", () => {
    expect(rangeStart("all", NOW)).toBeNull();
    expect(rangeStart("30d", NOW)?.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("stale orders", () => {
  it("deletes only unpaid orders older than 3 days that no payment started on", async () => {
    const calls: Record<string, unknown[]> = {};
    const chain: Record<string, unknown> = {};
    for (const m of ["delete", "eq", "lt", "or"]) chain[m] = (...a: unknown[]) => ((calls[m] = a), chain);
    chain.select = async () => ({ data: [{ id: "a" }, { id: "b" }], error: null });
    const db = { from: () => chain } as never;
    expect(await cleanupStaleOrders(db, NOW)).toBe(2);
    expect(calls.eq).toEqual(["status", "pending"]);
    expect(calls.lt).toEqual(["created_at", new Date(NOW - 3 * 86_400_000).toISOString()]);
    expect(String(calls.or[0])).toContain("provider_status.is.null");
    expect(String(calls.or[0])).not.toContain("partially");
  });
});
