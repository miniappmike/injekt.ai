import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ spicyTaskCost: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
vi.mock("@/lib/ai/providers/spicyapi", () => ({ spicyTaskCost: h.spicyTaskCost }));

import { checkRow, settleRow } from "@/lib/ledger-settle";
import { finances, type FinanceRow } from "@/lib/admin-stats";

function fakeDb() {
  const eq = vi.fn(async () => ({ error: null }));
  h.update.mockImplementation(() => ({ eq }));
  return { db: { from: () => ({ update: h.update }) } as never, eq };
}

beforeEach(() => vi.clearAllMocks());

describe("settleRow", () => {
  it("writes the total of every task's final charge as the real cost", async () => {
    const { db, eq } = fakeDb();
    h.spicyTaskCost.mockResolvedValueOnce({ cost: 0.011, settled: true }).mockResolvedValueOnce({ cost: 0.004, settled: true });
    expect(await settleRow(db, 7, "key", ["a", "b"])).toBe(true);
    expect(h.update).toHaveBeenCalledWith({ cost_usd: 0.015, cost_known: true, cost_source: "provider", cost_settled: true });
    expect(eq).toHaveBeenCalledWith("id", 7);
  });
  it("leaves the row alone while any charge is still held, or a task can't be read", async () => {
    const { db } = fakeDb();
    h.spicyTaskCost.mockResolvedValueOnce({ cost: 0.05, settled: false });
    expect(await settleRow(db, 1, "key", ["a"])).toBe(false);
    h.spicyTaskCost.mockResolvedValueOnce(null);
    expect(await settleRow(db, 1, "key", ["a"])).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("checkRow", () => {
  it("says whether a charge settled, is still held, or couldn't be read", async () => {
    const { db } = fakeDb();
    h.spicyTaskCost.mockResolvedValueOnce({ cost: 0.05, settled: true });
    expect(await checkRow(db, 1, "k", ["a"])).toBe("settled");
    h.spicyTaskCost.mockResolvedValueOnce({ cost: 0.05, settled: false });
    expect(await checkRow(db, 1, "k", ["a"])).toBe("held");
    h.spicyTaskCost.mockResolvedValueOnce(null);
    expect(await checkRow(db, 1, "k", ["a"])).toBe("unreadable");
  });
});

describe("finances", () => {
  it("never counts people's calls on their own keys, only the platform key (and admins when asked)", () => {
    const now = Date.parse("2026-11-11T00:00:00Z");
    const row = (user: string, key: "byok" | "server", cost: number): FinanceRow => ({ user_id: user, created_at: "2026-11-10T00:00:00Z", key_source: key, job: "image", status: "succeeded", model: "m", cost_usd: cost, cost_known: true, cost_source: "provider", cost_settled: true });
    const rows = [row("user", "byok", 1), row("user", "server", 0.05), row("admin", "byok", 0.03)];
    expect(finances(rows, new Map(), now)).toMatchObject({ images30: 1, people30: 1 });
    expect(finances(rows, new Map(), now).total30).toBeCloseTo(0.05);
    expect(finances(rows, new Map(), now, new Set(["admin"])).total30).toBeCloseTo(0.08);
  });

  const now = Date.parse("2026-11-11T00:00:00Z");
  const at = "2026-11-10T00:00:00Z";
  const img = (cost: number, gen: string, over: Partial<FinanceRow> = {}): FinanceRow => ({
    user_id: "u1", created_at: at, key_source: "byok", platform: "spicyapi", job: "image", feature: "image:inject", model: "seedream",
    status: "succeeded", cost_usd: cost, cost_known: true, cost_source: "provider", cost_settled: true, generation_id: gen, ...over,
  });
  const text = (tin: number, tout: number, cost: number, over: Partial<FinanceRow> = {}): FinanceRow => ({
    user_id: "u2", created_at: at, key_source: "byok", platform: "spicyapi", job: "llm", feature: "prompt", model: "sonnet",
    status: "succeeded", input_tokens: tin, output_tokens: tout, cost_usd: cost, cost_known: true, cost_source: "provider", cost_settled: true, ...over,
  });

  it("counts only the platform key: images, real cost per model and size, tokens in and out", () => {
    const sizes = new Map([["g1", "1k"], ["g2", "1k"], ["g3", "2k"]]);
    const f = finances(
      [
        img(0.03, "g1"),
        img(0.05, "g2", { cost_settled: false }),
        img(0.09, "g3", { user_id: "u3", key_source: "server" }),
        img(0, "g4", { status: "failed" }),
        text(1000, 500, 0.007),
        img(1, "old", { created_at: "2026-09-01T00:00:00Z" }), // over 30 days ago
      ],
      sizes,
      now,
      new Set(["u1", "u2"]), // admins: their own-key testing counts
    );
    expect(f.images30).toBe(3);
    expect(f.failedImages30).toBe(1);
    expect(f.imageCost30).toBeCloseTo(0.17);
    expect(f.avgImage).toBeCloseTo(0.17 / 3);
    expect(f.images.find((g) => g.size === "1k")).toMatchObject({ model: "seedream", count: 2, min: 0.03, max: 0.05, settled: 1 });
    expect(f.images.find((g) => g.size === "1k")!.avg).toBeCloseTo(0.04);
    expect(f.images.find((g) => g.size === "2k")!.count).toBe(1);
    expect(f.tokensIn30).toBe(1000);
    expect(f.tokensOut30).toBe(500);
    expect(f.server30).toBeCloseTo(0.09);
    expect(f.people30).toBe(3);
    expect(f.text[0]).toMatchObject({ feature: "prompt", calls: 1, avgIn: 1000, avgOut: 500, real: 1 });
  });

  it("fits the real per-million text price from settled charges", () => {
    // $2 per 1M in, $10 per 1M out
    const rows = [[1000, 200], [5000, 800], [2000, 2000], [8000, 100], [3000, 1500]].map(([i, o]) => text(i, o, (i * 2 + o * 10) / 1e6));
    const m = finances(rows, new Map(), now, new Set(["u2"])).measured[0];
    expect(m.model).toBe("sonnet");
    expect(m.input).toBeCloseTo(2, 6);
    expect(m.output).toBeCloseTo(10, 6);
    expect(m.calls).toBe(5);
  });
});
