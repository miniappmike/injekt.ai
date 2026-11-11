import { describe, expect, it } from "vitest";
import { finances, summarize, type FinanceRow } from "@/lib/admin-stats";
import { snapshotCsv, snapshotJson, snapshotMarkdown, type AdminSnapshot } from "@/lib/admin-export";

const now = Date.parse("2026-11-11T00:00:00Z");
const rows: FinanceRow[] = [
  { user_id: "a", created_at: "2026-11-10T00:00:00Z", key_source: "server", job: "image", status: "succeeded", model: "bytedance/seedream-5.0-pro/edit", cost_usd: 0.0495, cost_known: true, cost_source: "provider", cost_settled: true, generation_id: "g1" },
  { user_id: "a", created_at: "2026-11-10T00:00:00Z", key_source: "server", job: "vision", feature: "profile", status: "succeeded", model: "m", input_tokens: 3000, output_tokens: 1200, cost_usd: 0.018, cost_known: true, cost_source: "provider", cost_settled: true },
];
const f = finances(rows, new Map([["g1", "1.5k"]]), now);
const snap: AdminSnapshot = {
  generatedAt: "2026-11-11T09:00:00.000Z",
  config: { caps: { free: { runs: 3, likeness: 1 }, pro: { runs: 100, likeness: 30 } }, serverModel: "m" },
  stats: summarize([], [], [{ id: "a", email: "=evil@x.com", plan: "free", is_admin: false, ownKey: false }], now),
  realCosts: { platformKeyOnly: f, withAdminTesting: f },
  sweep: { checked: 3, settled: 2, held: 1, unreadable: 0 },
};

describe("admin export", () => {
  it("JSON has every section and round numbers", () => {
    const j = JSON.parse(snapshotJson(snap));
    expect(j.realCosts.withAdminTesting.images[0]).toMatchObject({ model: "bytedance/seedream-5.0-pro/edit", size: "1.5k", count: 1, avg: 0.0495 });
    expect(j.stats.users[0].email).toBe("=evil@x.com");
    expect(j.sweep).toEqual({ checked: 3, settled: 2, held: 1, unreadable: 0 });
  });
  it("Markdown reads as a report with tables", () => {
    const md = snapshotMarkdown(snap);
    expect(md).toContain("# Model Spawn admin report");
    expect(md).toContain("| bytedance/seedream-5.0-pro/edit | 1.5k | 1 | $0.0495 |");
    expect(md).toContain("| Build profile | m | 1 | 3000 | 1200 |");
    expect(md).toContain("2 settled, 1 still held");
  });
  it("CSV has every table, with formula-looking cells made harmless", () => {
    const csv = snapshotCsv(snap);
    expect(csv).toContain("Cost per image: platform key only");
    expect(csv).toContain("bytedance/seedream-5.0-pro/edit,1.5k,1,0.0495");
    expect(csv).toContain("'=evil@x.com");
  });
});
