import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootDb } from "./boot";

// purchase_persona(): the only way a persona is sold. Checked against the real migrations.
let t: Awaited<ReturnType<typeof bootDb>>;
let admin = "";
let alice = "";
let bob = "";
let freeWithCharacter = "";

type Result = { outcome: string; purchase_id: string | null; character_id: string | null; amount_cents: number | null };
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => t.db.query<T>(sql, params);

/** Calls the function the way the server does: as the service role. */
async function buy(listing: string, buyer: string, paymentId: string, amount: number | null = null, provider = "stripe") {
  await t.as(null, "service_role");
  const r = await q<Result>("select * from public.purchase_persona($1, $2, $3, $4, $5)", [listing, buyer, provider, paymentId, amount]);
  await t.db.exec("reset role");
  return r.rows[0];
}

const FULL = {
  face_sheet: "L/face.png",
  body_sheet: "L/body.jpg",
  profile_photo: "L/profile.webp",
  references: ["L/r1.jpg", "L/r2.jpg", "L/r3.jpg", "L/r4.jpg"],
};
const SNAPSHOT = {
  lore: "Night-life creator.",
  always_keep: "gold chain",
  height: "5'7\"",
  weight: "",
  profile: { identity_line: "Adult woman, heart-shaped face, jet-black waves.", face: "Almond hazel eyes." },
};

async function listing(opts: { status?: "draft" | "available"; price?: number; assets?: object } = {}) {
  await t.db.exec("reset role");
  const r = await q<{ id: string }>(
    `insert into public.marketplace_listings (name, price_cents, status, profile_snapshot, full_assets) values ('Nova', $1, $2, $3, $4) returning id`,
    [opts.price ?? 2500, opts.status ?? "available", JSON.stringify(SNAPSHOT), JSON.stringify(opts.assets ?? FULL)],
  );
  return r.rows[0].id;
}
const reserve = (id: string, buyer: string, minutes: number) =>
  t.trusted(`update public.marketplace_listings set status = 'reserved', reserved_by = $2, reserved_until = now() + ($3 || ' minutes')::interval, reserved_price_cents = price_cents where id = $1`, [id, buyer, String(minutes)]);
const row = async (id: string) =>
  (await q<{ status: string; sold_to: string | null; reserved_by: string | null }>("select status, sold_to, reserved_by from public.marketplace_listings where id = $1", [id])).rows[0];
const purchases = async (listing: string) => (await q("select * from public.purchases where listing_id = $1", [listing])).rows;

beforeAll(async () => {
  t = await bootDb();
  admin = await t.newUser("admin@x.com", { admin: true });
  alice = await t.newUser("alice@x.com");
  bob = await t.newUser("bob@x.com");
  freeWithCharacter = await t.newUser("free@x.com");
  await q("insert into public.characters (user_id, name, provenance_attested_at) values ($1, 'Her own', now())", [freeWithCharacter]);
});

beforeEach(() => t.resetMarketplace());

describe("a successful purchase", () => {
  it("sells the listing, records the purchase, and gives the buyer a character copied from the snapshot", async () => {
    const id = await listing();
    const r = await buy(id, alice, "cs_1", 2500);
    expect(r).toMatchObject({ outcome: "purchased", amount_cents: 2500 });

    expect(await row(id)).toMatchObject({ status: "sold", sold_to: alice, reserved_by: null });
    const [p] = await purchases(id);
    expect(p).toMatchObject({ id: r.purchase_id, buyer_id: alice, provider: "stripe", provider_payment_id: "cs_1", amount_cents: 2500, character_id: r.character_id, assets_copied_at: null });

    const c = (await q<Record<string, unknown>>("select * from public.characters where id = $1", [r.character_id])).rows[0];
    expect(c).toMatchObject({ user_id: alice, name: "Nova", lore: "Night-life creator.", always_keep: "gold chain", height: "5'7\"", weight: null, purchased_from_listing_id: id });
    expect(c.profile).toEqual(SNAPSHOT.profile);
    // New paths in the buyer's own folder, keeping each file's type; at most 3 references.
    const base = `${alice}/characters/${r.character_id}`;
    expect(c).toMatchObject({ face_sheet_path: `${base}/face-sheet.png`, body_sheet_path: `${base}/body-sheet.jpg`, profile_photo_path: `${base}/profile.webp` });
    expect(c.reference_paths).toEqual([`${base}/reference-1.jpg`, `${base}/reference-2.jpg`, `${base}/reference-3.jpg`]);

    // The copy plan the server carries out: from the listing's private files to those new paths.
    expect(p.asset_copies).toEqual([
      { from_bucket: "marketplace-assets", from: "L/face.png", to_bucket: "character-media", to: `${base}/face-sheet.png` },
      { from_bucket: "marketplace-assets", from: "L/body.jpg", to_bucket: "character-media", to: `${base}/body-sheet.jpg` },
      { from_bucket: "marketplace-assets", from: "L/profile.webp", to_bucket: "character-media", to: `${base}/profile.webp` },
      { from_bucket: "marketplace-assets", from: "L/r1.jpg", to_bucket: "character-media", to: `${base}/reference-1.jpg` },
      { from_bucket: "marketplace-assets", from: "L/r2.jpg", to_bucket: "character-media", to: `${base}/reference-2.jpg` },
      { from_bucket: "marketplace-assets", from: "L/r3.jpg", to_bucket: "character-media", to: `${base}/reference-3.jpg` },
    ]);
  });

  it("works with only some files, and on the free plan even when the buyer already has a character", async () => {
    const id = await listing({ assets: { face_sheet: "L/face" } });
    const r = await buy(id, freeWithCharacter, "cs_free");
    expect(r.outcome).toBe("purchased");
    const c = (await q<Record<string, unknown>>("select face_sheet_path, body_sheet_path, reference_paths from public.characters where id = $1", [r.character_id])).rows[0];
    expect(c).toEqual({ face_sheet_path: `${freeWithCharacter}/characters/${r.character_id}/face-sheet.jpg`, body_sheet_path: null, reference_paths: [] });
    // The free limit still holds for characters she makes herself.
    await t.as(freeWithCharacter);
    await expect(q("insert into public.characters (user_id, name, provenance_attested_at) values ($1, 'Another', now())", [freeWithCharacter])).rejects.toThrow(/character_limit_reached/);
  });

  it("the buyer reads the assets afterwards; the listing shows as sold to everyone else, without saying to whom", async () => {
    const id = await listing();
    await buy(id, alice, "cs_2");
    await t.as(alice);
    expect((await q("select * from public.get_listing_assets($1)", [id])).rows).toHaveLength(1);
    await t.as(bob);
    expect((await q("select * from public.get_listing_assets($1)", [id])).rows).toHaveLength(0);
    await t.as(null, "anon");
    expect((await q("select status from public.marketplace_listings where id = $1", [id])).rows).toEqual([{ status: "sold" }]);
  });
});

describe("idempotency", () => {
  it("the same payment twice records one purchase and one character, and reports the first result", async () => {
    const id = await listing();
    const first = await buy(id, alice, "cs_replay", 2500);
    const again = await buy(id, alice, "cs_replay", 2500);
    expect(again).toEqual({ ...first, outcome: "already_recorded" });
    expect(await purchases(id)).toHaveLength(1);
    expect((await q("select id from public.characters where purchased_from_listing_id = $1", [id])).rows).toHaveLength(1);
  });

  it("refuses a payment id that was already used for something else", async () => {
    const a = await listing();
    const b = await listing();
    await buy(a, alice, "cs_dup");
    await expect(buy(b, alice, "cs_dup")).rejects.toThrow(/purchase_payment_id_reused/);
    await expect(buy(a, bob, "cs_dup")).rejects.toThrow(/purchase_payment_id_reused/);
    expect(await row(b)).toMatchObject({ status: "available" });
  });
});

describe("one owner only", () => {
  it("a second buyer with a different payment gets 'sold', and nothing changes", async () => {
    const id = await listing();
    await buy(id, alice, "cs_a");
    expect(await buy(id, bob, "cs_b")).toMatchObject({ outcome: "sold", purchase_id: null });
    expect(await row(id)).toMatchObject({ sold_to: alice });
    expect(await purchases(id)).toHaveLength(1);
  });

  it("someone else's live reservation blocks the sale; a lapsed one doesn't", async () => {
    const id = await listing();
    await reserve(id, bob, 10);
    expect((await buy(id, alice, "cs_blocked")).outcome).toBe("unavailable");
    expect(await row(id)).toMatchObject({ status: "reserved", reserved_by: bob });

    await t.resetMarketplace();
    const lapsed = await listing();
    await reserve(lapsed, bob, -1);
    expect((await buy(lapsed, alice, "cs_after_lapse")).outcome).toBe("purchased");
    expect(await row(lapsed)).toMatchObject({ status: "sold", sold_to: alice, reserved_by: null });
  });

  it("the buyer holding the reservation buys at the reserved price, even after a price change, and even if the hold has just run out", async () => {
    const id = await listing({ price: 2500 });
    await reserve(id, alice, 10);
    await t.as(admin);
    await q("update public.marketplace_listings set price_cents = 9900 where id = $1", [id]);
    expect(await buy(id, alice, "cs_held", 2500)).toMatchObject({ outcome: "purchased", amount_cents: 2500 });

    await t.resetMarketplace();
    const late = await listing({ price: 1500 });
    await reserve(late, alice, -1);
    expect((await buy(late, alice, "cs_late")).outcome).toBe("purchased");
  });

  it("drafts, delisted personas and unknown listings can't be bought", async () => {
    const draft = await listing({ status: "draft" });
    expect((await buy(draft, alice, "cs_d")).outcome).toBe("unavailable");
    const pulled = await listing();
    await t.as(admin);
    await q("update public.marketplace_listings set status = 'delisted' where id = $1", [pulled]);
    expect((await buy(pulled, alice, "cs_p")).outcome).toBe("unavailable");
    expect((await buy("00000000-0000-4000-8000-000000000000", alice, "cs_x")).outcome).toBe("not_found");
    expect((await q("select id from public.purchases")).rows).toHaveLength(0);
  });

  it("a payment for the wrong amount sells nothing", async () => {
    const id = await listing({ price: 2500 });
    expect(await buy(id, alice, "cs_cheap", 100)).toMatchObject({ outcome: "amount_mismatch", amount_cents: 2500, purchase_id: null });
    expect(await row(id)).toMatchObject({ status: "available" });
  });
});

describe("who can call it", () => {
  it("only the server: signed-in users and visitors can't buy without paying", async () => {
    const id = await listing();
    for (const [who, role] of [[alice, "authenticated"], [null, "anon"]] as const) {
      await t.as(who, role);
      await expect(q("select * from public.purchase_persona($1, $2, 'stripe', 'free', null)", [id, alice])).rejects.toThrow(/permission denied/);
    }
    await t.db.exec("reset role");
    expect(await row(id)).toMatchObject({ status: "available" });
  });

  it("rejects missing arguments", async () => {
    const id = await listing();
    await expect(buy(id, alice, "")).rejects.toThrow(/purchase_bad_arguments/);
    await expect(buy(id, alice, "cs_1", null, "")).rejects.toThrow(/purchase_bad_arguments/);
  });
});
