import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// The marketplace's rules, checked against the real migrations in an in-process Postgres with stand-ins for Supabase's
// auth and storage schemas and its API roles.
let t: Awaited<ReturnType<typeof bootDb>>;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);
const as = (...a: Parameters<typeof t.as>) => t.as(...a);
const trusted = (...a: Parameters<typeof t.trusted>) => t.trusted(...a);
async function listing(status: "draft" | "available" = "available", price = 2500) {
  await t.db.exec("reset role");
  const r = await q<{ id: string }>(
    `insert into public.marketplace_listings (name, price_cents, status, public_profile, profile_snapshot, full_assets)
     values ('Nova', $1, $2, '{"tagline":"Night owl"}', '{"face":"secret face"}', '{"face_sheet":"x/face.jpg"}') returning id`,
    [price, status],
  );
  return r.rows[0].id;
}
const sell = (id: string, buyer: string) =>
  trusted("update public.marketplace_listings set status = 'sold', sold_to = $2, sold_at = now(), reserved_by = null, reserved_until = null, reserved_price_cents = null where id = $1", [id, buyer]);
const reserve = (id: string, buyer: string, minutes: number) =>
  trusted(`update public.marketplace_listings set status = 'reserved', reserved_by = $2, reserved_until = now() + ($3 || ' minutes')::interval, reserved_price_cents = price_cents where id = $1`, [id, buyer, String(minutes)]);
const visible = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows.length;

let admin = "";
let alice = "";
let bob = "";

beforeAll(async () => {
  t = await bootDb();
  admin = await t.newUser("admin@x.com", { admin: true });
  alice = await t.newUser("alice@x.com");
  bob = await t.newUser("bob@x.com");
});

beforeEach(() => t.resetMarketplace());

describe("public reads", () => {
  it("anyone sees available and sold listings, and a reservation that ran out, but not drafts, delisted or live reservations", async () => {
    const available = await listing();
    const sold = await listing();
    await sell(sold, alice);
    const draft = await listing("draft");
    const delisted = await listing();
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [delisted]);
    const held = await listing();
    await reserve(held, bob, 10);
    const lapsed = await listing();
    await reserve(lapsed, bob, -1);

    for (const who of [null, alice] as const) {
      await as(who, who ? "authenticated" : "anon");
      const ids = (await q<{ id: string }>("select id from public.marketplace_listings")).rows.map((r) => r.id);
      expect(ids.sort()).toEqual([available, sold, lapsed].sort());
      expect(ids).not.toContain(draft);
      expect(ids).not.toContain(held);
    }
  });

  it("never exposes who bought or reserved a persona, where it came from, or what the buyer receives", async () => {
    const id = await listing();
    await sell(id, alice);
    for (const col of ["sold_to", "reserved_by", "source_character_id", "profile_snapshot", "full_assets", "reserved_price_cents"]) {
      for (const who of [null, bob, alice] as const) {
        await as(who, who ? "authenticated" : "anon");
        await expect(q(`select ${col} from public.marketplace_listings where id = $1`, [id])).rejects.toThrow(/permission denied/);
      }
    }
    await as(null, "anon");
    const row = (await q<{ name: string; public_profile: { tagline: string } }>("select name, price_cents, status, public_profile from public.marketplace_listings where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ name: "Nova", public_profile: { tagline: "Night owl" } });
  });

  it("shows a listing's preview images exactly when the listing itself is public", async () => {
    const shown = await listing();
    const hidden = await listing("draft");
    await t.db.exec("reset role");
    await q("insert into public.listing_images (listing_id, storage_path, sort_order) values ($1, $3, 0), ($2, $4, 0)", [shown, hidden, `${shown}/1.jpg`, `${hidden}/1.jpg`]);
    await as(null, "anon");
    expect((await q<{ listing_id: string }>("select listing_id from public.listing_images")).rows.map((r) => r.listing_id)).toEqual([shown]);
  });
});

describe("full assets", () => {
  it("only the buyer and admins can read them", async () => {
    const id = await listing();
    const read = async () => (await q<{ full_assets: unknown }>("select * from public.get_listing_assets($1)", [id])).rows;

    await as(alice);
    expect(await read()).toEqual([]); // not sold yet, so nobody owns it
    await sell(id, alice);
    await as(alice);
    expect((await read())[0]).toMatchObject({ full_assets: { face_sheet: "x/face.jpg" }, profile_snapshot: { face: "secret face" } });
    await as(bob);
    expect(await read()).toEqual([]);
    await as(admin);
    expect(await read()).toHaveLength(1);
    await as(null, "anon");
    await expect(read()).rejects.toThrow(/permission denied/);
  });

  it("storage: previews follow the listing; full files are readable by the buyer and admins only; only admins upload", async () => {
    const id = await listing();
    const draft = await listing("draft");
    await t.db.exec("reset role");
    await q(
      `insert into storage.objects (bucket_id, name) values ('marketplace-previews', $1), ('marketplace-previews', $2), ('marketplace-assets', $3)`,
      [`${id}/p.jpg`, `${draft}/p.jpg`, `${id}/face.jpg`],
    );
    const objects = (bucket: string) => visible("select name from storage.objects where bucket_id = $1", [bucket]);

    await as(null, "anon");
    expect(await objects("marketplace-previews")).toBe(1); // the draft's preview stays hidden
    expect(await objects("marketplace-assets")).toBe(0);

    await sell(id, alice);
    await as(bob);
    expect(await objects("marketplace-assets")).toBe(0);
    await as(alice);
    expect(await objects("marketplace-assets")).toBe(1);
    await as(admin);
    expect(await objects("marketplace-assets")).toBe(1);
    expect(await objects("marketplace-previews")).toBe(2);

    await as(alice);
    await expect(q("insert into storage.objects (bucket_id, name) values ('marketplace-assets', $1)", [`${id}/evil.jpg`])).rejects.toThrow(/row-level security/);
    await as(admin);
    await q("insert into storage.objects (bucket_id, name) values ('marketplace-previews', $1)", [`${id}/new.jpg`]);
  });
});

describe("only admins write listings", () => {
  it("a regular user can't create, edit the price of, delist or delete a listing, or touch its images", async () => {
    const id = await listing();
    await as(alice);
    await expect(q("insert into public.marketplace_listings (name, price_cents) values ('Mine', 100)")).rejects.toThrow(/row-level security/);
    await q("update public.marketplace_listings set price_cents = 1 where id = $1", [id]);
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [id]);
    await q("delete from public.marketplace_listings where id = $1", [id]);
    await expect(q("insert into public.listing_images (listing_id, storage_path) values ($1, 'x')", [id])).rejects.toThrow(/row-level security/);
    await t.db.exec("reset role");
    expect((await q("select price_cents, status from public.marketplace_listings where id = $1", [id])).rows[0]).toEqual({ price_cents: 2500, status: "available" });
  });

  it("an admin creates, prices, publishes, delists and relists", async () => {
    await as(admin);
    const id = (await q<{ id: string }>("insert into public.marketplace_listings (name, price_cents) values ('Juno', 1900) returning id")).rows[0].id;
    await q("update public.marketplace_listings set price_cents = 2900, status = 'available' where id = $1", [id]);
    await q("insert into public.listing_images (listing_id, storage_path, sort_order) values ($1, $2, 0)", [id, `${id}/a.jpg`]);
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [id]);
    await q("update public.marketplace_listings set status = 'available' where id = $1", [id]);
    await t.db.exec("reset role");
    const row = (await q<{ price_cents: number; status: string; published_at: string | null }>("select price_cents, status, published_at from public.marketplace_listings where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ price_cents: 2900, status: "available" });
    expect(row.published_at).not.toBeNull();
  });

  it("even an admin can't reserve or sell directly, change a sold persona, or delist one someone is paying for", async () => {
    const id = await listing();
    await as(admin);
    await expect(q("update public.marketplace_listings set status = 'sold' where id = $1", [id])).rejects.toThrow(/listing_transition_not_allowed|sold_has_buyer/);
    await expect(q("update public.marketplace_listings set status = 'reserved' where id = $1", [id])).rejects.toThrow(/listing_transition_not_allowed|reserved_has_holder/);
    await expect(q("insert into public.marketplace_listings (name, price_cents, status) values ('X', 100, 'sold')")).rejects.toThrow(/listing_status_not_allowed|sold_has_buyer/);

    await reserve(id, bob, 10);
    await as(admin);
    await expect(q("update public.marketplace_listings set status = 'delisted' where id = $1", [id])).rejects.toThrow(/listing_reserved/);
    // A price edit during checkout is allowed, but the reservation keeps the price the buyer saw.
    await q("update public.marketplace_listings set price_cents = 9900 where id = $1", [id]);
    await t.db.exec("reset role");
    expect((await q("select price_cents, reserved_price_cents from public.marketplace_listings where id = $1", [id])).rows[0]).toEqual({ price_cents: 9900, reserved_price_cents: 2500 });

    await sell(id, bob);
    await as(admin);
    await expect(q("update public.marketplace_listings set price_cents = 100 where id = $1", [id])).rejects.toThrow(/listing_sold/);
    await expect(q("update public.marketplace_listings set status = 'delisted' where id = $1", [id])).rejects.toThrow(/listing_sold/);
    await expect(q("delete from public.marketplace_listings where id = $1", [id])).rejects.toThrow(/listing_not_deletable/);
  });

  it("delisting a lapsed reservation is allowed and clears it", async () => {
    const id = await listing();
    await reserve(id, bob, -1);
    await as(admin);
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [id]);
    await t.db.exec("reset role");
    expect((await q("select status, reserved_by, reserved_until from public.marketplace_listings where id = $1", [id])).rows[0]).toEqual({ status: "delisted", reserved_by: null, reserved_until: null });
  });
});

describe("purchases", () => {
  it("can't be written through the API; buyers read only their own; one per listing and per provider payment", async () => {
    const a = await listing();
    const b = await listing();
    await as(alice);
    await expect(q("insert into public.purchases (listing_id, buyer_id, provider, provider_payment_id, amount_cents) values ($1, $2, 'stripe', 'pi_1', 2500)", [a, alice])).rejects.toThrow(/permission denied/);

    await t.db.exec("reset role");
    await q("insert into public.purchases (listing_id, buyer_id, provider, provider_payment_id, amount_cents) values ($1, $2, 'stripe', 'pi_1', 2500)", [a, alice]);
    await expect(q("insert into public.purchases (listing_id, buyer_id, provider, provider_payment_id, amount_cents) values ($1, $2, 'stripe', 'pi_2', 2500)", [a, bob])).rejects.toThrow(/duplicate key/);
    await expect(q("insert into public.purchases (listing_id, buyer_id, provider, provider_payment_id, amount_cents) values ($1, $2, 'stripe', 'pi_1', 2500)", [b, bob])).rejects.toThrow(/duplicate key/);

    await as(alice);
    expect(await visible("select id from public.purchases")).toBe(1);
    await as(bob);
    expect(await visible("select id from public.purchases")).toBe(0);
    await as(admin);
    expect(await visible("select id from public.purchases")).toBe(1);
  });

  it("a character's owner can't claim it was bought from a listing", async () => {
    const id = await listing();
    await t.db.exec("reset role");
    const c = (await q<{ id: string }>("insert into public.characters (user_id, name, provenance_attested_at) values ($1, 'Mine', now()) returning id", [admin])).rows[0].id;
    await as(admin);
    await expect(q("update public.characters set purchased_from_listing_id = $1 where id = $2", [id, c])).rejects.toThrow(/purchased_from_listing_id_locked/);
    await q("update public.characters set name = 'Renamed' where id = $1", [c]);
  });
});

describe("marketplace_counts()", () => {
  it("counts available (plus lapsed holds) and sold for anyone, and nothing else", async () => {
    await listing();
    await listing();
    const sold = await listing();
    await sell(sold, alice);
    await listing("draft");
    const delisted = await listing();
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [delisted]);
    const held = await listing();
    await reserve(held, bob, 10);
    const lapsed = await listing();
    await reserve(lapsed, bob, -1);

    for (const who of [null, alice] as const) {
      await as(who, who ? "authenticated" : "anon");
      const r = await q<{ available: number; sold: number }>("select * from public.marketplace_counts()");
      // Two available, plus one lapsed hold; one sold. Drafts, delisted and live holds are not counted.
      expect(r.rows).toEqual([{ available: 3, sold: 1 }]);
      expect(Object.keys(r.rows[0]).sort()).toEqual(["available", "sold"]);
    }
  });

  it("is zero when the shelf is empty", async () => {
    await as(null, "anon");
    expect((await q("select * from public.marketplace_counts()")).rows).toEqual([{ available: 0, sold: 0 }]);
  });

  it("is a definer function with a fixed search path, closed to the public role", async () => {
    await t.db.exec("reset role");
    const r = await q<{ secdef: boolean; cfg: string[] }>("select prosecdef as secdef, proconfig as cfg from pg_proc where proname = 'marketplace_counts'");
    expect(r.rows[0].secdef).toBe(true);
    expect(r.rows[0].cfg.join(",")).toMatch(/search_path/);
  });
});
