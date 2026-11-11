import { beforeAll, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// Migration 0021: settlement columns and the images count in ledger_summary, against the real migrations.
let t: Awaited<ReturnType<typeof bootDb>>;
beforeAll(async () => {
  t = await bootDb();
});

describe("ledger settlement (0021)", () => {
  it("keeps task ids and the settled flag, and ledger_summary counts images generated", async () => {
    const u = await t.newUser("s@x.com");
    await t.db.exec("reset role");
    const ins = (job: string, status: string, created: string) =>
      t.db.query(
        `insert into public.api_ledger (user_id, platform, job, feature, model, key_source, status, cost_usd, cost_known, cost_source, provider_task_ids, created_at)
         values ($1, 'spicyapi', $2, 'image:inject', 'm', 'byok', $3, 0.05, true, 'provider', array['task-1'], $4)`,
        [u, job, status, created],
      );
    await ins("image", "succeeded", "2026-10-24T10:00:00Z");
    await ins("image", "succeeded", "2026-09-10T10:00:00Z"); // last month
    await ins("image", "failed", "2026-10-24T11:00:00Z"); // not an image generated
    await ins("vision", "succeeded", "2026-10-24T12:00:00Z");
    const r = (await t.db.query<{ cost_settled: boolean; provider_task_ids: string[] }>("select cost_settled, provider_task_ids from public.api_ledger where user_id = $1 limit 1", [u])).rows[0];
    expect(r).toEqual({ cost_settled: false, provider_task_ids: ["task-1"] });

    await t.as(u);
    const s = (await t.db.query<Record<string, string>>("select * from ledger_summary($1, $2, null)", ["2026-10-24T00:00:00Z", "2026-10-01T00:00:00Z"])).rows;
    expect(s).toHaveLength(1);
    expect(Number(s[0].images)).toBe(2);
    expect(Number(s[0].month_images)).toBe(1);
    expect(Number(s[0].calls)).toBe(4);
  });
});
