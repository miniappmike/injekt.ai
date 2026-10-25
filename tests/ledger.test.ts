import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getLedgerEntries,
  getLedgerSummary,
  rangeStart,
  recordLedgerEntry,
  recordTextCall,
  spendWindows,
  toLedgerEntry,
} from "@/lib/ledger";
import { COST_SOURCE_LABELS, featureLabel, jobLabel, ledgerCsv, platformLabel, platformOf, type LedgerEntry } from "@/lib/ledger-types";

describe("platformOf", () => {
  it("is the provider id, SpicyAPI addresses count as SpicyAPI, and other addresses are named by their host", () => {
    expect(platformOf({ provider: "anthropic" })).toBe("anthropic");
    expect(platformOf({ provider: "spicyapi" })).toBe("spicyapi");
    expect(platformOf({ provider: "custom", baseUrl: "https://api.spicyapi.ai/v1" })).toBe("spicyapi");
    expect(platformOf({ provider: "custom", baseUrl: "https://api.groq.com/openai/v1" })).toBe("api.groq.com");
    expect(platformOf({ provider: "custom", baseUrl: "https://evilspicyapi.ai/v1" })).toBe("evilspicyapi.ai");
    expect(platformOf({ provider: "custom" })).toBe("custom");
  });
  it("has readable names", () => {
    expect(platformLabel("spicyapi")).toBe("SpicyAPI");
    expect(platformLabel("api.groq.com")).toBe("api.groq.com");
    expect(featureLabel("image:direct_swap")).toBe("Direct swap");
    expect(featureLabel("profile")).toBe("Build profile");
    expect(featureLabel("brand-new")).toBe("brand-new");
    expect(jobLabel("llm")).toBe("Text");
  });
});

describe("spendWindows and rangeStart", () => {
  it("find the start of the person's own day and month whatever their timezone", () => {
    const ny = spendWindows(new Date("2026-10-24T01:30:00Z"), 300); // New York is 5 hours behind: still Oct 23 there
    expect(ny.dayStart.toISOString()).toBe("2026-10-23T05:00:00.000Z");
    expect(ny.monthStart.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    const tokyo = spendWindows(new Date("2026-10-24T01:30:00Z"), -540);
    expect(tokyo.dayStart.toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(tokyo.monthStart.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(spendWindows(new Date("2026-11-01T02:00:00Z"), 300).monthStart.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("turns each range into a start time, or none for all time", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const w = spendWindows(now, 0);
    expect(rangeStart("today", now, w)?.toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(rangeStart("week", now, w)?.toISOString()).toBe("2026-10-17T12:00:00.000Z");
    expect(rangeStart("month", now, w)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(rangeStart("all", now, w)).toBeNull();
  });
});

function fakeDb(error: { message: string } | null = null) {
  const rows: Record<string, unknown>[] = [];
  return { rows, db: { from: (t: string) => ({ insert: async (r: Record<string, unknown>) => (rows.push({ _table: t, ...r }), { error }) }) } as never };
}

describe("recordLedgerEntry", () => {
  it("writes a priced call with where the number came from", async () => {
    const { rows, db } = fakeDb();
    await recordLedgerEntry(db, { userId: "u", platform: "spicyapi", job: "image", feature: "image:inject", model: "m", keySource: "byok", costUsd: 0.04, costSource: "provider", generationId: "g1" });
    expect(rows[0]).toEqual({
      _table: "api_ledger",
      user_id: "u",
      platform: "spicyapi",
      job: "image",
      feature: "image:inject",
      model: "m",
      key_source: "byok",
      status: "succeeded",
      input_tokens: null,
      output_tokens: null,
      cost_usd: 0.04,
      cost_known: true,
      cost_source: "provider",
      generation_id: "g1",
    });
  });

  it("writes a call it could not price as unpriced, with no source", async () => {
    const { rows, db } = fakeDb();
    await recordLedgerEntry(db, { userId: "u", platform: "openai", job: "vision", feature: "profile", keySource: "byok", costUsd: null, costSource: "list_price" });
    expect(rows[0]).toMatchObject({ cost_usd: 0, cost_known: false, cost_source: null });
  });

  it("treats a free call as free, not unknown", async () => {
    const { rows, db } = fakeDb();
    await recordLedgerEntry(db, { userId: "u", platform: "spicyapi", job: "image", feature: "image:edit", keySource: "byok", status: "failed", costUsd: 0, costSource: "provider" });
    expect(rows[0]).toMatchObject({ cost_usd: 0, cost_known: true, status: "failed" });
  });

  it("never throws when the ledger can't be written, so the person's work is not lost", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ message: "db down" });
    await expect(recordLedgerEntry(db, { userId: "u", platform: "p", job: "llm", feature: "test", keySource: "byok", costUsd: 0 })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("recordTextCall", () => {
  const setup = { provider: "anthropic", model: "claude-sonnet-5-5" };
  const base = { userId: "u", job: "vision" as const, feature: "profile" as const, setup, keySource: "byok" as const };

  it("prices tokens at the provider's list price", async () => {
    const { rows, db } = fakeDb();
    await recordTextCall(db, { ...base, usage: { inputTokens: 4000, outputTokens: 600 }, price: { price: { input: 2, output: 10 }, source: "list" } });
    expect(rows[0]).toMatchObject({ platform: "anthropic", job: "vision", feature: "profile", model: "claude-sonnet-5-5", input_tokens: 4000, output_tokens: 600, cost_known: true, cost_source: "list_price" });
    expect(rows[0].cost_usd as number).toBeCloseTo(0.014, 6);
  });

  it("says when the price was the person's own", async () => {
    const { rows, db } = fakeDb();
    await recordTextCall(db, { ...base, usage: { inputTokens: 1_000_000, outputTokens: 0 }, price: { price: { input: 3, output: 15 }, source: "you" } });
    expect(rows[0]).toMatchObject({ cost_usd: 3, cost_source: "your_price" });
  });

  it("names a SpicyAPI address as SpicyAPI", async () => {
    const { rows, db } = fakeDb();
    await recordTextCall(db, { ...base, setup: { provider: "custom", baseUrl: "https://api.spicyapi.ai/v1", model: "m" }, usage: { inputTokens: 1, outputTokens: 1 }, price: { price: null, source: null } });
    expect(rows[0]).toMatchObject({ platform: "spicyapi" });
  });

  it("still records a call with no price, or no token count, as unpriced", async () => {
    const { rows, db } = fakeDb();
    await recordTextCall(db, { ...base, usage: { inputTokens: 10, outputTokens: 1 }, price: { price: null, source: null } });
    await recordTextCall(db, { ...base, usage: undefined, price: { price: { input: 2, output: 10 }, source: "list" } });
    expect(rows[0]).toMatchObject({ cost_usd: 0, cost_known: false, cost_source: null, input_tokens: 10 });
    expect(rows[1]).toMatchObject({ cost_usd: 0, cost_known: false, cost_source: null, input_tokens: null });
  });

  it("records platform-paid calls as such", async () => {
    const { rows, db } = fakeDb();
    await recordTextCall(db, { ...base, keySource: "server", usage: { inputTokens: 5, outputTokens: 5 }, price: { price: { input: 1, output: 1 }, source: "list" } });
    expect(rows[0]).toMatchObject({ key_source: "server" });
  });
});

describe("reading the ledger", () => {
  it("turns database rows into entries with real numbers", () => {
    const e = toLedgerEntry({
      id: 7, created_at: "2026-10-24T10:00:00Z", platform: "spicyapi", job: "image", feature: "image:inject", model: "m", key_source: "byok", status: "succeeded",
      input_tokens: null, output_tokens: null, cost_usd: "0.040000", cost_known: true, cost_source: "provider", generation_id: "g",
    });
    expect(e).toMatchObject({ id: 7, costUsd: 0.04, keySource: "byok", costSource: "provider", generationId: "g", createdAt: "2026-10-24T10:00:00Z" });
  });

  it("maps the per-platform summary and rejects a failed read", async () => {
    const ok = { rpc: async () => ({ data: [{ platform: "spicyapi", day_cost: "0.1", month_cost: "0.5", all_cost: "1.25", calls: "9", month_calls: "4", input_tokens: "100", output_tokens: "10", unpriced_calls: "1" }], error: null }) } as never;
    const w = spendWindows(new Date("2026-10-24T12:00:00Z"), 0);
    expect(await getLedgerSummary(ok, w)).toEqual([{ platform: "spicyapi", today: 0.1, month: 0.5, all: 1.25, calls: 9, monthCalls: 4, inputTokens: 100, outputTokens: 10, unpricedCalls: 1 }]);
    await expect(getLedgerSummary({ rpc: async () => ({ data: null, error: { message: "x" } }) } as never, w)).rejects.toThrow();
  });

  function fakeQuery(rows: unknown[]) {
    const calls: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "eq", "gte", "gt", "lt"]) q[m] = (...a: unknown[]) => (calls.push([m, ...a]), q);
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
    return { calls, supabase: { from: (t: string) => (calls.push(["from", t]), q) } as never };
  }
  const row = (id: number) => ({ id, created_at: "2026-10-24T10:00:00Z", platform: "p", job: "vision", feature: "profile", model: null, key_source: "byok", status: "succeeded", input_tokens: 1, output_tokens: 1, cost_usd: 0.01, cost_known: true, cost_source: "list_price", generation_id: null });

  it("asks for newest first, applies each filter, and says whether there is more", async () => {
    const { calls, supabase } = fakeQuery([row(5), row(4), row(3)]);
    const page = await getLedgerEntries(supabase, { platform: "spicyapi", job: "image", since: new Date("2026-10-01T00:00:00Z"), beforeId: 9, limit: 2 });
    expect(page.entries.map((e) => e.id)).toEqual([5, 4]);
    expect(page.hasMore).toBe(true);
    expect(calls).toContainEqual(["from", "api_ledger"]);
    expect(calls).toContainEqual(["order", "id", { ascending: false }]);
    expect(calls).toContainEqual(["limit", 3]); // one extra, to know if there is more
    expect(calls).toContainEqual(["eq", "platform", "spicyapi"]);
    expect(calls).toContainEqual(["eq", "job", "image"]);
    expect(calls).toContainEqual(["gte", "created_at", "2026-10-01T00:00:00.000Z"]);
    expect(calls).toContainEqual(["lt", "id", 9]);
  });

  it("uses afterId for what is newer, and adds no filters that were not asked for", async () => {
    const { calls, supabase } = fakeQuery([row(11)]);
    const page = await getLedgerEntries(supabase, { afterId: 10, limit: 50 });
    expect(page).toEqual({ entries: [expect.objectContaining({ id: 11 })], hasMore: false });
    expect(calls).toContainEqual(["gt", "id", 10]);
    expect(calls.some((c) => c[0] === "eq" || c[0] === "gte" || c[0] === "lt")).toBe(false);
  });
});

describe("ledgerCsv", () => {
  const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    id: 1, createdAt: "2026-10-24T10:00:00Z", platform: "spicyapi", job: "image", feature: "image:inject", model: "bytedance/seedream-5.0-pro/edit", keySource: "byok", status: "succeeded",
    inputTokens: null, outputTokens: null, costUsd: 0.04, costKnown: true, costSource: "provider", generationId: null, ...over,
  });

  it("has a header and one readable row per entry", () => {
    const lines = ledgerCsv([entry()]).split("\n");
    expect(lines[0]).toBe("Time (UTC),Platform,Job,What,Model,Input tokens,Output tokens,Cost (USD),Cost known,Cost source,Status,Paid by");
    expect(lines[1]).toBe(`2026-10-24T10:00:00Z,SpicyAPI,Image,Inject,bytedance/seedream-5.0-pro/edit,,,0.04,yes,${COST_SOURCE_LABELS.provider},succeeded,You`);
  });

  it("leaves the cost blank when it is unknown, and says who paid", () => {
    const row = ledgerCsv([entry({ costKnown: false, costUsd: 0, costSource: null, keySource: "server" })]).split("\n")[1];
    expect(row).toContain(",,no,,succeeded,Model Spawn");
  });

  it("quotes commas and quotes, and defuses spreadsheet formulas", () => {
    const row = ledgerCsv([entry({ model: '=HYPERLINK("http://x","y"),z' })]).split("\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""http://x"",""y""),z"`);
    expect(ledgerCsv([entry({ model: "+1" })])).toContain(",'+1,");
    expect(ledgerCsv([])).toBe("Time (UTC),Platform,Job,What,Model,Input tokens,Output tokens,Cost (USD),Cost known,Cost source,Status,Paid by");
  });
});
