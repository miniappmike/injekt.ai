import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ info: vi.fn(), resolveApiKey: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/key-store", () => ({ keyResolverDeps: {} }));
vi.mock("@/lib/keys", () => ({ resolveApiKey: h.resolveApiKey }));
vi.mock("@/lib/ai/providers/registry", () => ({ getImageProvider: () => ({ info: h.info }) }));

import { buildTypical, featureLabel, getSpendOverview, getTypicalCosts, recordTextUsage, spendWindows } from "@/lib/spend";

describe("spendWindows", () => {
  it("finds the start of the person's own day and month, whatever their timezone", () => {
    // New York in winter is 5 hours behind UTC, so getTimezoneOffset() is +300.
    const ny = spendWindows(new Date("2026-10-24T01:30:00Z"), 300);
    expect(ny.dayStart.toISOString()).toBe("2026-10-23T05:00:00.000Z"); // it is still Oct 23 evening there
    expect(ny.monthStart.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    // Tokyo is 9 hours ahead: offset -540.
    const tokyo = spendWindows(new Date("2026-10-24T01:30:00Z"), -540);
    expect(tokyo.dayStart.toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(tokyo.monthStart.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(spendWindows(new Date("2026-10-24T12:00:00Z"), 0).dayStart.toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("puts a late-night call in the right month", () => {
    // 02:00 UTC on Nov 1 is still Oct 31 at 21:00 in New York.
    expect(spendWindows(new Date("2026-11-01T02:00:00Z"), 300).monthStart.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});

describe("recordTextUsage", () => {
  function fakeDb() {
    const rows: Record<string, unknown>[] = [];
    return { rows, db: { from: () => ({ insert: async (r: Record<string, unknown>) => void rows.push(r) }) } as never };
  }
  const base = { userId: "u", job: "vision" as const, feature: "profile" as const, provider: "anthropic", model: "claude-sonnet-5-5", keySource: "byok" as const };

  it("prices a call from its tokens", async () => {
    const { rows, db } = fakeDb();
    await recordTextUsage(db, { ...base, usage: { inputTokens: 4000, outputTokens: 600 }, price: { input: 2, output: 10 } });
    expect(rows[0]).toMatchObject({ user_id: "u", job: "vision", feature: "profile", cost_known: true, input_tokens: 4000, output_tokens: 600, key_source: "byok" });
    expect(rows[0].cost_usd as number).toBeCloseTo(0.014, 6);
  });

  it("still counts a call it cannot price, and says so", async () => {
    const { rows, db } = fakeDb();
    await recordTextUsage(db, { ...base, usage: { inputTokens: 10, outputTokens: 1 }, price: null });
    expect(rows[0]).toMatchObject({ cost_usd: 0, cost_known: false, input_tokens: 10 });
    await recordTextUsage(db, { ...base, usage: undefined, price: { input: 2, output: 10 } });
    expect(rows[1]).toMatchObject({ cost_usd: 0, cost_known: false, input_tokens: null, output_tokens: null });
  });
});

describe("buildTypical", () => {
  it("prefers the person's own history, then a rough figure, then admits it does not know", () => {
    const history = [
      { feature: "profile", avg_cost: "0.0142", runs: 3 },
      { feature: "image:inject", avg_cost: "0.0400", runs: 2 },
    ];
    const withPrice = buildTypical(history, { input: 2, output: 10 });
    expect(withPrice.find((t) => t.feature === "profile")).toMatchObject({ basis: "history", runs: 3, label: "Build profile" });
    expect(withPrice.find((t) => t.feature === "profile")!.cost).toBeCloseTo(0.0142);
    expect(withPrice.find((t) => t.feature === "prompt")).toMatchObject({ basis: "rough", runs: 0 });
    expect(withPrice.find((t) => t.feature === "prompt")!.cost).toBeCloseTo(0.03);
    expect(withPrice.find((t) => t.feature === "image:inject")).toMatchObject({ label: "Image · Inject", basis: "history" });

    const noPrice = buildTypical([], null);
    expect(noPrice.every((t) => t.basis === "unknown" && t.cost === null)).toBe(true);
  });

  it("labels features", () => {
    expect(featureLabel("likeness")).toBe("Likeness check");
    expect(featureLabel("image:direct_swap")).toBe("Image · Direct swap");
    expect(featureLabel("something-new")).toBe("something-new");
  });
});

function fakeSupabase(opts: { prefs?: unknown; summary?: unknown[]; typical?: unknown[] }) {
  return {
    rpc: async (name: string) => ({ data: name === "spend_summary" ? (opts.summary ?? []) : (opts.typical ?? []) }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { prefs: opts.prefs ?? {} } }) }) }) }),
  } as never;
}

const spicy = { provider: "spicyapi", model: "anthropic/claude-sonnet-5.5/chat" };
const NOW = new Date("2026-10-24T15:00:00Z");

describe("getSpendOverview", () => {
  it("lists every job with its spend, set-up and price, and adds up the totals", async () => {
    const supabase = fakeSupabase({
      prefs: { roles: { vision: spicy, llm: { keyFrom: "vision", model: "moonshot/kimi-k3/chat" }, image: { provider: "spicyapi", model: "bytedance/seedream-5.0-pro/edit" } } },
      summary: [
        { job: "vision", day_cost: "0.05", month_cost: "0.30", month_calls: "12", month_input_tokens: "90000", month_output_tokens: "9000", unpriced_calls: "0" },
        { job: "image", day_cost: "0.08", month_cost: "0.40", month_calls: "5", month_input_tokens: "0", month_output_tokens: "0", unpriced_calls: "0" },
      ],
    });
    const o = await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW });
    expect(o.jobs.map((j) => j.id)).toEqual(["vision", "llm", "image"]);
    expect(o.today).toBeCloseTo(0.13);
    expect(o.month).toBeCloseTo(0.7);

    const vision = o.jobs[0];
    expect(vision).toMatchObject({ label: "Vision", calls: 12, inputTokens: 90000, setup: { provider: "SpicyAPI", model: spicy.model } });
    expect(vision.price).toEqual({ input: 2, output: 10, source: "list" });

    const text = o.jobs[1]; // borrows Vision's key with its own model, so the list price of Sonnet does not apply
    expect(text.setup).toMatchObject({ model: "moonshot/kimi-k3/chat", usesKeyOf: "Vision" });
    expect(text.price).toBeNull();
    expect(text.calls).toBe(0);

    expect(o.jobs[2].price).toBeNull(); // the provider reports image costs itself
    expect(o.jobs[2].today).toBeCloseTo(0.08);
  });

  it("shows jobs with no set-up as such, with zero spend", async () => {
    const o = await getSpendOverview(fakeSupabase({}), "u", { tzOffsetMinutes: 0, now: NOW });
    expect(o.jobs.every((j) => j.setup === null && j.month === 0 && j.price === null)).toBe(true);
    expect(o.today).toBe(0);
  });

  it("uses the price the person entered, and says whose number it is", async () => {
    const supabase = fakeSupabase({ prefs: { roles: { vision: { provider: "openai", model: "gpt-4o", price: { input: 2.5, output: 10 } } } } });
    const o = await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW });
    expect(o.jobs[0].price).toEqual({ input: 2.5, output: 10, source: "you" });
    // Text falls back to Vision's setup when it has none of its own.
    expect(o.jobs[1].setup).toMatchObject({ model: "gpt-4o", usesKeyOf: "Vision" });
  });

  it("adds the provider's balance and image prices only when asked", async () => {
    h.resolveApiKey.mockResolvedValue({ key: "sk-spicy-x", source: "byok" });
    h.info.mockResolvedValue({ balance: "4.93", prices: [{ label: "1k", price: "0.04" }, { label: "2k", price: "0.08" }] });
    const supabase = fakeSupabase({ prefs: { roles: { image: { provider: "spicyapi", model: "bytedance/seedream-5.0-pro/edit" } } } });

    expect((await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW })).provider).toBeUndefined();
    const full = await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW, details: true });
    expect(full.provider).toEqual({ name: "SpicyAPI", balance: "4.93", imagePrices: [{ label: "1k", price: "0.04" }, { label: "2k", price: "0.08" }] });
    expect(h.info).toHaveBeenCalledWith({ apiKey: "sk-spicy-x", model: "bytedance/seedream-5.0-pro/edit" });
  });

  it("leaves the provider section out, rather than failing, when the provider can't be reached", async () => {
    h.resolveApiKey.mockRejectedValue(new Error("no key"));
    const supabase = fakeSupabase({ prefs: { roles: { image: { provider: "spicyapi", model: "m" } } } });
    const o = await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW, details: true });
    expect(o.provider).toBeUndefined();
    expect(o.jobs).toHaveLength(3);
  });

  it("never asks a non-SpicyAPI provider for a balance", async () => {
    h.info.mockClear();
    const supabase = fakeSupabase({ prefs: { roles: { vision: { provider: "anthropic", model: "claude-sonnet-5-5" } } } });
    const o = await getSpendOverview(supabase, "u", { tzOffsetMinutes: 0, now: NOW, details: true });
    expect(o.provider).toBeUndefined();
    expect(h.info).not.toHaveBeenCalled();
  });
});

describe("getTypicalCosts", () => {
  it("uses the Vision job's price for the rough figure", async () => {
    const supabase = fakeSupabase({ prefs: { roles: { vision: { provider: "anthropic", model: "claude-sonnet-5-5" } } }, typical: [{ feature: "prompt", avg_cost: "0.02", runs: 4 }] });
    const t = await getTypicalCosts(supabase, "u");
    expect(t.find((x) => x.feature === "prompt")).toMatchObject({ basis: "history", runs: 4 });
    expect(t.find((x) => x.feature === "profile")).toMatchObject({ basis: "rough" });
  });
});
