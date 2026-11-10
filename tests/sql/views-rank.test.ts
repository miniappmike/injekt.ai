import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// Views (once per person per day) and the Virality Rank (views + likes, unsold only), against the real migrations.
let t: Awaited<ReturnType<typeof bootDb>>;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);
const who = (n: number) => `v:${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

async function listing(name: string, status: "draft" | "available" = "available", publishedDaysAgo = 1) {
  await t.db.exec("reset role");
  return (
    await q<{ id: string }>(
      "insert into public.marketplace_listings (name, price_cents, status, published_at) values ($1, 2500, $2, now() - ($3 || ' days')::interval) returning id",
      [name, status, String(publishedDaysAgo)],
    )
  ).rows[0].id;
}
async function view(id: string, viewer: string) {
  await t.as(null, "service_role");
  await q("select public.record_listing_view($1, $2)", [id, viewer]);
  await t.db.exec("reset role");
}
async function like(id: string, liker: string) {
  await t.as(null, "service_role");
  await q("select * from public.toggle_listing_like($1, $2)", [id, liker]);
  await t.db.exec("reset role");
}
async function stats(ids: string[] | null = null, role: "anon" | "authenticated" | "service_role" = "anon") {
  await t.as(null, role);
  const r = (await q<{ listing_id: string; views: number; likes: number; rank: number | null }>("select * from public.listing_stats($1)", [ids])).rows;
  await t.db.exec("reset role");
  return Object.fromEntries(r.map((x) => [x.listing_id, { views: x.views, likes: x.likes, rank: x.rank }]));
}

beforeAll(async () => {
  t = await bootDb();
});
beforeEach(async () => {
  await t.db.exec("reset role; delete from public.listing_views; delete from public.listing_likes;");
  await t.resetMarketplace();
});

describe("views", () => {
  it("count once per person per day; drafts aren't counted", async () => {
    const a = await listing("A");
    await view(a, who(1));
    await view(a, who(1)); // same person, same day
    await view(a, who(2));
    await t.db.exec("reset role");
    await q("insert into public.listing_views (listing_id, viewer, day) values ($1, $2, current_date - 1)", [a, who(1)]); // yesterday
    const draft = await listing("D", "draft");
    await view(draft, who(1));
    expect((await stats([a]))[a].views).toBe(3);
    expect((await q("select * from public.listing_views where listing_id = $1", [draft])).rows).toHaveLength(0);
  });

  it("only the server records them, and nobody can see who viewed what", async () => {
    const a = await listing("A");
    for (const role of ["anon", "authenticated"] as const) {
      await t.as(null, role);
      await expect(q("select public.record_listing_view($1, $2)", [a, who(1)])).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.listing_views")).rejects.toThrow(/permission denied/);
    }
    await t.db.exec("reset role");
    await expect(view(a, "nobody")).rejects.toThrow(/view_bad_viewer/);
  });
});

describe("virality rank", () => {
  it("orders unsold personas by views + likes; sold ones have no rank; ties go to the earlier listing", async () => {
    const a = await listing("A", "available", 5);
    const b = await listing("B", "available", 3);
    const c = await listing("C", "available", 1);
    const sold = await listing("S", "available", 9);
    await view(a, who(1));
    await like(b, who(1));
    await like(b, who(2));
    await view(sold, who(1));
    await view(sold, who(2));
    await view(sold, who(3));
    const buyer = await t.newUser("buyer@x.com");
    await t.trusted("update public.marketplace_listings set status = 'sold', sold_to = $2, sold_at = now() where id = $1", [sold, buyer]);

    const s = await stats();
    expect(s[b]).toEqual({ views: 0, likes: 2, rank: 1 });
    expect(s[a]).toEqual({ views: 1, likes: 0, rank: 2 });
    expect(s[c]).toEqual({ views: 0, likes: 0, rank: 3 });
    expect(s[sold]).toEqual({ views: 3, likes: 0, rank: null });

    // A tie: A gets a like (A = 2, B = 2); A was listed earlier, so it moves to #1.
    await like(a, who(9));
    const t2 = await stats();
    expect([t2[a].rank, t2[b].rank]).toEqual([1, 2]);
  });

  it("is readable by everyone, can be asked for a few personas, and hides drafts", async () => {
    const a = await listing("A");
    const draft = await listing("D", "draft");
    for (const role of ["anon", "authenticated"] as const) {
      const s = await stats([a, draft], role);
      expect(Object.keys(s)).toEqual([a]);
    }
  });
});
