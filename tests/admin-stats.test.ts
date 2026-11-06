import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/admin-stats";

const now = Date.parse("2026-11-06T15:00:00Z");
const A = "a", B = "b";
const users = [
  { id: A, email: "a@x.test", plan: "free" as const, is_admin: false, ownKey: false },
  { id: B, email: "b@x.test", plan: "pro" as const, is_admin: false, ownKey: true },
];

describe("admin stats", () => {
  it("adds up the platform key's spend by day and person, keeps own-key spend apart, and averages per day", () => {
    const s = summarize(
      [
        { user_id: A, created_at: "2026-11-06T10:00:00Z", key_source: "server", cost_usd: "0.02" },
        { user_id: A, created_at: "2026-11-03T10:00:00Z", key_source: "server", cost_usd: 0.05 },
        { user_id: A, created_at: "2026-10-20T10:00:00Z", key_source: "server", cost_usd: 0.1, cost_known: false },
        { user_id: A, created_at: "2026-09-01T10:00:00Z", key_source: "server", cost_usd: 9 }, // older than 30 days
        { user_id: B, created_at: "2026-11-06T11:00:00Z", key_source: "byok", cost_usd: 1 },
      ],
      [
        { user_id: A, day: "2026-11-06", key: "runs", count: 2 },
        { user_id: A, day: "2026-11-02", key: "runs", count: 3 },
        { user_id: A, day: "2026-11-06", key: "likeness", count: 1 },
        { user_id: A, day: "2026-10-01", key: "runs", count: 9 }, // older than 7 days
      ],
      users,
      now,
    );
    expect(s.serverToday).toBeCloseTo(0.02);
    expect(s.server7).toBeCloseTo(0.07);
    expect(s.server30).toBeCloseTo(0.17);
    expect(s.avgPerDay7).toBeCloseTo(0.01);
    expect(s.projectedMonth).toBeCloseTo(0.3);
    expect(s.unpricedCalls30).toBe(1);
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toEqual({ day: "2026-11-06", cost: 0.02, calls: 1 });
    expect(s.activeToday).toBe(1);
    expect(s.runsToday).toBe(2);
    const a = s.users[0];
    expect(a).toMatchObject({ id: A, runsToday: 2, likenessToday: 1, runs7: 5, calls30: 3 });
    expect(a.server30).toBeCloseTo(0.17);
    expect(s.users[1]).toMatchObject({ id: B, ownKey30: 1, server30: 0, lastActive: "2026-11-06T11:00:00Z" });
  });

  it("works with no data", () => {
    const s = summarize([], [], [], now);
    expect(s).toMatchObject({ server30: 0, avgPerDay7: 0, users: [] });
  });
});
