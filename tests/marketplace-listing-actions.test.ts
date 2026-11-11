import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const CHAR = "22222222-2222-4222-8222-222222222222";
const LISTING = "33333333-3333-4333-8333-333333333333";
const IMG = (n: number) => `44444444-4444-4444-8444-44444444444${n}`;

type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  plan: "admin" as string,
  dbCalls: 0,
  tables: {} as Record<string, Row[]>,
  copies: [] as { from: string; to: string; dest?: string }[],
  uploads: [] as { bucket: string; path: string }[],
  removed: [] as string[],
  png: Buffer.alloc(0),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }) }));
vi.mock("@/lib/entitlements", () => ({ entitlements: { planOf: async () => h.plan } }));

// A tiny in-memory stand-in for the parts of supabase-js these actions use.
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => {
    h.dbCalls++;
    const query = (table: string) => {
      let rows = () => h.tables[table] ?? (h.tables[table] = []);
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      let ord: { col: string; asc: boolean } | undefined;
      let lim: number | undefined;
      const matched = () => {
        let out = rows().filter((r) => filters.every((f) => f(r)));
        if (ord) out = [...out].sort((a, b) => (a[ord!.col] > b[ord!.col] ? 1 : -1) * (ord!.asc ? 1 : -1));
        return lim ? out.slice(0, lim) : out;
      };
      const exec = () => {
        if (op === "update") for (const r of matched()) Object.assign(r, patch);
        if (op === "delete") h.tables[table] = rows().filter((r) => !filters.every((f) => f(r)));
        return { data: op === "select" ? matched() : null, error: null as null | { message: string } };
      };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        order: (col: string, o?: { ascending?: boolean }) => ((ord = { col, asc: o?.ascending !== false }), q),
        limit: (n: number) => ((lim = n), q),
        update: (p: Row) => ((op = "update"), (patch = p), q),
        delete: () => ((op = "delete"), q),
        insert: (r: Row) => {
          const row = { id: `new-${rows().length + 1}`, ...r };
          rows().push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return q;
    };
    return {
      from: query,
      storage: {
        from: (bucket: string) => ({
          download: async () => ({ data: new Blob([h.png]), error: null }),
          upload: async (path: string) => (h.uploads.push({ bucket, path }), { error: null }),
          remove: async (paths: string[]) => (h.removed.push(...paths), { error: null }),
          copy: async (from: string, to: string, o?: { destinationBucket?: string }) => (h.copies.push({ from, to, dest: o?.destinationBucket }), { error: null }),
        }),
      },
    };
  },
}));

import sharp from "sharp";
import {
  addPreviewFromCharacter,
  addPreviewUpload,
  getOrCreateDraft,
  publishListing,
  removePreview,
  reorderPreviews,
  updateListingDetails,
  updateListingPrice,
} from "@/app/(app)/characters/[id]/listing-actions";
import { centsToDollars, dollarsToCents, suggestFromProfile } from "@/lib/marketplace/listing-input";

const profile = { tagline: "Hi", bio: "Bio", tags: ["a"] };
const details = { name: "Mia", priceCents: 2900, publicProfile: profile };

function seed(over: Row = {}) {
  h.tables = {
    characters: [{ id: CHAR, user_id: ADMIN, name: "Mia", lore: "L", always_keep: "K", height: "5'6", weight: "120", profile: { identity_line: "x" }, profile_photo_path: `${ADMIN}/characters/p.jpg`, face_sheet_path: `${ADMIN}/characters/f.jpg`, body_sheet_path: null, reference_paths: [`${ADMIN}/characters/r0.jpg`] }],
    marketplace_listings: [{ id: LISTING, source_character_id: CHAR, name: "Mia", price_cents: 2900, status: "draft", reserved_until: null, public_profile: profile, ...over }],
    listing_images: [{ id: IMG(1), listing_id: LISTING, storage_path: `${LISTING}/a.jpg`, sort_order: 0 }],
  };
}

beforeEach(async () => {
  h.plan = "admin";
  h.dbCalls = 0;
  h.copies = [];
  h.uploads = [];
  h.removed = [];
  h.png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#456" } }).png().toBuffer();
  seed();
});

describe("only admins", () => {
  it("refuses every action for a non-admin and touches no data", async () => {
    h.plan = "pro";
    const fd = new FormData();
    const results = [
      await getOrCreateDraft(CHAR),
      await updateListingDetails(LISTING, details),
      await updateListingPrice(LISTING, 2900),
      await addPreviewFromCharacter(LISTING, "face_sheet"),
      await addPreviewUpload(LISTING, fd),
      await removePreview(IMG(1)),
      await reorderPreviews(LISTING, [IMG(1)]),
      await publishListing(LISTING),
    ];
    for (const r of results) expect(r).toEqual({ ok: false, error: "Admins only." });
    expect(h.dbCalls).toBe(0);
  });
});

describe("price and details", () => {
  it("converts dollars to cents and back", () => {
    expect(dollarsToCents("29.00")).toBe(2900);
    expect(dollarsToCents("$1,299.5")).toBe(129950);
    expect(dollarsToCents("0.5")).toBe(50);
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("1.234")).toBeNull();
    expect(centsToDollars(2900)).toBe("29.00");
  });

  it("enforces the $0.50 minimum and $100,000 maximum", async () => {
    expect((await updateListingPrice(LISTING, 49)).ok).toBe(false);
    expect((await updateListingPrice(LISTING, 10_000_001)).ok).toBe(false);
    expect((await updateListingPrice(LISTING, 50)).ok).toBe(true);
    expect((await updateListingPrice(LISTING, 10_000_000)).ok).toBe(true);
    expect(h.tables.marketplace_listings[0].price_cents).toBe(10_000_000);
  });

  it("ignores any age sent or stored: the profile is tagline, bio and tags only", async () => {
    const r = await updateListingDetails(LISTING, { ...details, priceCents: 3500, publicProfile: { ...profile, age: 17 } as any });
    expect(r.ok).toBe(true);
    expect(h.tables.marketplace_listings[0]).toMatchObject({ price_cents: 3500, public_profile: { tagline: "Hi", bio: "Bio", tags: ["a"] } });
    expect(h.tables.marketplace_listings[0].public_profile).not.toHaveProperty("age");
  });

  it("limits tagline, bio and tags", async () => {
    expect((await updateListingDetails(LISTING, { ...details, publicProfile: { ...profile, tagline: "x".repeat(121) } })).ok).toBe(false);
    expect((await updateListingDetails(LISTING, { ...details, publicProfile: { ...profile, bio: "x".repeat(1201) } })).ok).toBe(false);
    expect((await updateListingDetails(LISTING, { ...details, publicProfile: { ...profile, tags: Array(9).fill("t") } })).ok).toBe(false);
  });

  it("refuses edits and publishing once sold", async () => {
    seed({ status: "sold" });
    expect((await updateListingDetails(LISTING, details)).ok).toBe(false);
    expect((await updateListingPrice(LISTING, 3000)).ok).toBe(false);
    expect((await publishListing(LISTING)).ok).toBe(false);
    expect((await removePreview(IMG(1))).ok).toBe(false);
    expect(h.tables.marketplace_listings[0].price_cents).toBe(2900);
  });
});

describe("drafts", () => {
  it("reuses an existing listing, otherwise creates a draft at the default price", async () => {
    expect(await getOrCreateDraft(CHAR)).toEqual({ ok: true, listingId: LISTING });
    h.tables.marketplace_listings = [];
    const r = await getOrCreateDraft(CHAR);
    expect(r.ok).toBe(true);
    expect(h.tables.marketplace_listings[0]).toMatchObject({ source_character_id: CHAR, name: "Mia", price_cents: 2900, status: "draft" });
  });

  it("refuses a character that isn't the admin's", async () => {
    h.tables.characters[0].user_id = "someone-else";
    expect((await getOrCreateDraft(CHAR)).ok).toBe(false);
  });

  it("won't list a sold character again", async () => {
    seed({ status: "sold" });
    expect((await getOrCreateDraft(CHAR)).ok).toBe(false);
  });
});

describe("previews", () => {
  it("adds a watermarked preview from her picture, below the existing ones", async () => {
    const r = await addPreviewFromCharacter(LISTING, "face_sheet");
    expect(r.ok).toBe(true);
    expect(h.uploads[0].bucket).toBe("marketplace-previews");
    expect(h.uploads[0].path.startsWith(`${LISTING}/`)).toBe(true);
    expect(h.tables.listing_images.at(-1)).toMatchObject({ listing_id: LISTING, sort_order: 1 });
  });

  it("says so when she doesn't have that picture", async () => {
    expect((await addPreviewFromCharacter(LISTING, "body_sheet")).ok).toBe(false);
    expect((await addPreviewFromCharacter(LISTING, "nonsense")).ok).toBe(false);
  });

  it("accepts an uploaded image and rejects other types and huge files", async () => {
    const good = new FormData();
    good.set("file", new File([h.png], "a.png", { type: "image/png" }));
    expect((await addPreviewUpload(LISTING, good)).ok).toBe(true);
    const bad = new FormData();
    bad.set("file", new File(["x"], "a.gif", { type: "image/gif" }));
    expect((await addPreviewUpload(LISTING, bad)).ok).toBe(false);
    const big = new FormData();
    big.set("file", new File([new Uint8Array(15 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }));
    expect((await addPreviewUpload(LISTING, big)).ok).toBe(false);
  });

  it("caps previews at 10", async () => {
    h.tables.listing_images = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, listing_id: LISTING, storage_path: `p${i}`, sort_order: i }));
    const r = await addPreviewFromCharacter(LISTING, "face_sheet");
    expect(r.ok).toBe(false);
    expect(h.uploads).toHaveLength(0);
  });

  it("removes the row and the stored file", async () => {
    expect((await removePreview(IMG(1))).ok).toBe(true);
    expect(h.tables.listing_images).toHaveLength(0);
    expect(h.removed).toContain(`${LISTING}/a.jpg`);
  });

  it("reorders, and rejects ids from another listing or a partial list", async () => {
    h.tables.listing_images.push({ id: IMG(2), listing_id: LISTING, storage_path: "b", sort_order: 1 }, { id: IMG(3), listing_id: "other", storage_path: "c", sort_order: 0 });
    expect((await reorderPreviews(LISTING, [IMG(2), IMG(1)])).ok).toBe(true);
    expect(h.tables.listing_images.find((r) => r.id === IMG(2))!.sort_order).toBe(0);
    expect(h.tables.listing_images.find((r) => r.id === IMG(1))!.sort_order).toBe(1);
    expect((await reorderPreviews(LISTING, [IMG(2), IMG(3)])).ok).toBe(false);
    expect((await reorderPreviews(LISTING, [IMG(2)])).ok).toBe(false);
    expect(h.tables.listing_images.find((r) => r.id === IMG(3))!.sort_order).toBe(0);
  });
});

describe("publishing", () => {
  it("copies the full files into marketplace-assets and writes the snapshot", async () => {
    const r = await publishListing(LISTING);
    expect(r.ok).toBe(true);
    expect(h.copies).toHaveLength(3);
    for (const c of h.copies) {
      expect(c.dest).toBe("marketplace-assets");
      expect(c.to.startsWith(`${LISTING}/`)).toBe(true);
      expect(c.from.startsWith(`${ADMIN}/`)).toBe(true);
    }
    const l = h.tables.marketplace_listings[0];
    expect(l.status).toBe("available");
    expect(l.full_assets).toEqual({
      face_sheet: `${LISTING}/face_sheet.jpg`,
      body_sheet: null,
      profile_photo: `${LISTING}/profile_photo.jpg`,
      references: [`${LISTING}/reference_0.jpg`],
    });
    expect(l.profile_snapshot).toEqual({ lore: "L", always_keep: "K", height: "5'6", weight: "120", profile: { identity_line: "x" } });
  });

  it("needs a preview", async () => {
    h.tables.listing_images = [];
    expect((await publishListing(LISTING)).ok).toBe(false);
    expect(h.copies).toHaveLength(0);
    expect(h.tables.marketplace_listings[0].status).toBe("draft");
  });

  it("publishes a listing that has no age stored", async () => {
    seed({ public_profile: { tagline: "Hi", bio: "Bio", tags: [] } });
    expect((await publishListing(LISTING)).ok).toBe(true);
  });

  it("needs a face sheet, body sheet or reference", async () => {
    h.tables.characters[0].face_sheet_path = null;
    h.tables.characters[0].reference_paths = [];
    expect((await publishListing(LISTING)).ok).toBe(false);
  });

  it("refuses while someone is mid-checkout, and allows it after the hold ran out", async () => {
    seed({ status: "reserved", reserved_until: new Date(Date.now() + 60_000).toISOString() });
    expect((await publishListing(LISTING)).ok).toBe(false);
    seed({ status: "reserved", reserved_until: new Date(Date.now() - 60_000).toISOString() });
    expect((await publishListing(LISTING)).ok).toBe(true);
  });
});

describe("suggestFromProfile", () => {
  it("builds a short tagline and a bio from the profile, no AI", () => {
    const s = suggestFromProfile({ identity_line: "x".repeat(300), face: "Soft jaw", hair: "Auburn" });
    expect(s.tagline.length).toBeLessThanOrEqual(120);
    expect(s.bio).toContain("Soft jaw");
    expect(suggestFromProfile(null)).toEqual({ tagline: "", bio: "" });
  });
});
