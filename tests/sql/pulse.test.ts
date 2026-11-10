import { beforeAll, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// The public "pulse": two numbers, broadcast live, kept current by the database. The listings table itself stays out
// of the live feed so its private columns never travel on it.
let t: Awaited<ReturnType<typeof bootDb>>;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);
const pulse = async () => (await q<{ available: number; sold: number }>("select available, sold from public.marketplace_pulse")).rows[0];

beforeAll(async () => {
  t = await bootDb();
});

describe("marketplace pulse", () => {
  it("follows publishing, selling and delisting", async () => {
    await t.resetMarketplace();
    const buyer = await t.newUser("buyer@x.com");
    await t.db.exec("reset role");
    const a = (await q<{ id: string }>("insert into public.marketplace_listings (name, price_cents, status) values ('A', 100, 'available') returning id")).rows[0].id;
    const b = (await q<{ id: string }>("insert into public.marketplace_listings (name, price_cents, status) values ('B', 100, 'available') returning id")).rows[0].id;
    await q("insert into public.marketplace_listings (name, price_cents) values ('Draft', 100)");
    expect(await pulse()).toEqual({ available: 2, sold: 0 });
    await t.trusted("update public.marketplace_listings set status = 'sold', sold_to = $2, sold_at = now() where id = $1", [a, buyer]);
    expect(await pulse()).toEqual({ available: 1, sold: 1 });
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [b]);
    expect(await pulse()).toEqual({ available: 0, sold: 1 });
  });

  it("everyone can read it, nobody can write it, and the listings table is not broadcast", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await t.as(null, role);
      expect(await pulse()).toBeTruthy();
      await expect(q("update public.marketplace_pulse set sold = 999")).rejects.toThrow(/permission denied/);
    }
    await t.db.exec("reset role");
    const tables = (await q<{ tablename: string }>("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).rows.map((r) => r.tablename);
    expect(tables).toContain("marketplace_pulse");
    expect(tables).not.toContain("marketplace_listings");
  });
});
