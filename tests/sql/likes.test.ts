import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// Hearts on marketplace personas, checked against the real migrations.
let t: Awaited<ReturnType<typeof bootDb>>;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);
const U1 = "u:11111111-1111-4111-8111-111111111111";
const V1 = "v:22222222-2222-4222-8222-222222222222";

async function listing(status: "draft" | "available" = "available") {
  await t.db.exec("reset role");
  return (await q<{ id: string }>("insert into public.marketplace_listings (name, price_cents, status) values ('Nova', 2500, $1) returning id", [status])).rows[0].id;
}
async function toggle(id: string, liker: string) {
  await t.as(null, "service_role");
  const r = (await q<{ liked: boolean; likes: number }>("select * from public.toggle_listing_like($1, $2)", [id, liker])).rows[0];
  await t.db.exec("reset role");
  return r;
}
async function counts(ids: string[], liker: string | null) {
  await t.as(null, "service_role");
  const r = (await q<{ listing_id: string; likes: number; liked: boolean }>("select * from public.listing_like_counts($1, $2)", [ids, liker])).rows;
  await t.db.exec("reset role");
  return r;
}

beforeAll(async () => {
  t = await bootDb();
});
beforeEach(async () => {
  await t.db.exec("reset role; delete from public.listing_likes;");
  await t.resetMarketplace();
});

describe("hearts", () => {
  it("one heart per account or browser: hearting again takes it back", async () => {
    const id = await listing();
    expect(await toggle(id, U1)).toEqual({ liked: true, likes: 1 });
    expect(await toggle(id, V1)).toEqual({ liked: true, likes: 2 });
    expect(await toggle(id, U1)).toEqual({ liked: false, likes: 1 });
    expect(await counts([id], V1)).toEqual([{ listing_id: id, likes: 1, liked: true }]);
    expect(await counts([id], U1)).toEqual([{ listing_id: id, likes: 1, liked: false }]);
    expect(await counts([id], null)).toEqual([{ listing_id: id, likes: 1, liked: false }]);
  });

  it("sold personas can be hearted; drafts and delisted ones can't, and their counts aren't given out", async () => {
    const sold = await listing();
    await t.trusted("update public.marketplace_listings set status = 'sold', sold_to = (select id from auth.users limit 1), sold_at = now() where id = $1", [sold]).catch(async () => {
      // No users yet in this database: make one for the buyer.
      await t.newUser("buyer@x.com");
      await t.trusted("update public.marketplace_listings set status = 'sold', sold_to = (select id from auth.users limit 1), sold_at = now() where id = $1", [sold]);
    });
    expect((await toggle(sold, V1)).liked).toBe(true);
    const draft = await listing("draft");
    await expect(toggle(draft, V1)).rejects.toThrow(/like_not_public/);
    expect(await counts([draft], null)).toEqual([]);
  });

  it("rejects made-up likers", async () => {
    const id = await listing();
    await expect(toggle(id, "anything")).rejects.toThrow(/like_bad_liker/);
    await expect(toggle(id, "u:not-a-uuid")).rejects.toThrow(/like_bad_liker/);
  });

  it("only the server can heart or see who hearted: visitors and users get nothing directly", async () => {
    const id = await listing();
    await toggle(id, V1);
    const user = await t.newUser("someone@x.com");
    for (const [who, role] of [[null, "anon"], [user, "authenticated"]] as const) {
      await t.as(who, role);
      await expect(q("select * from public.listing_likes")).rejects.toThrow(/permission denied/);
      await expect(q("insert into public.listing_likes (listing_id, liker) values ($1, $2)", [id, U1])).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.toggle_listing_like($1, $2)", [id, U1])).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.listing_like_counts($1, $2)", [[id], V1])).rejects.toThrow(/permission denied/);
    }
    await t.db.exec("reset role");
  });
});
