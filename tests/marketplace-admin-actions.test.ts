import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const CHAR = "22222222-2222-4222-8222-222222222222";
const LISTING = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  plan: "admin" as string,
  dbCalls: 0,
  tables: {} as Record<string, Row[]>,
  copies: [] as { from: string; to: string; dest?: string }[],
  uploads: [] as { bucket: string; path: string }[],
  removed: [] as string[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => h.revalidated.push(p) }));
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
          download: async () => ({ data: new Blob([Buffer.alloc(0)]), error: null }),
          upload: async (path: string) => (h.uploads.push({ bucket, path }), { error: null }),
          remove: async (paths: string[]) => (h.removed.push(...paths), { error: null }),
          copy: async (from: string, to: string, o?: { destinationBucket?: string }) => (h.copies.push({ from, to, dest: o?.destinationBucket }), { error: null }),
        }),
      },
    };
  },
}));

import { delistListing, relistListing, setListingPrice } from "@/app/(app)/marketplace/admin-actions";

const ASSETS = { face_sheet: `${LISTING}/face_sheet.jpg`, body_sheet: null, profile_photo: null, references: [] };
const status = () => h.tables.marketplace_listings[0].status;

function seed(over: Row = {}) {
  h.tables = {
    marketplace_listings: [{ id: LISTING, source_character_id: CHAR, name: "Mia", price_cents: 2900, status: "available", reserved_until: null, full_assets: ASSETS, ...over }],
    listing_images: [{ id: "i1", listing_id: LISTING, storage_path: `${LISTING}/a.jpg`, sort_order: 0 }],
  };
}
const inFuture = () => new Date(Date.now() + 60_000).toISOString();
const inPast = () => new Date(Date.now() - 60_000).toISOString();

beforeEach(() => {
  h.plan = "admin";
  h.dbCalls = 0;
  h.revalidated = [];
  seed();
});

describe("only admins", () => {
  it("refuses delist, relist and price changes for a non-admin and touches no data", async () => {
    h.plan = "pro";
    for (const r of [await delistListing(LISTING), await relistListing(LISTING), await setListingPrice(LISTING, 2900)]) {
      expect(r).toEqual({ ok: false, error: "Admins only." });
    }
    expect(h.dbCalls).toBe(0);
    expect(status()).toBe("available");
  });

  it("rejects ids that aren't ids", async () => {
    expect((await delistListing("nope")).ok).toBe(false);
    expect((await relistListing("nope")).ok).toBe(false);
    expect((await setListingPrice("nope", 2900)).ok).toBe(false);
  });
});

describe("delistListing", () => {
  it("delists an available persona and refreshes the grid, characters list and character page", async () => {
    expect(await delistListing(LISTING)).toEqual({ ok: true });
    expect(status()).toBe("delisted");
    expect(h.revalidated).toEqual(expect.arrayContaining(["/marketplace", "/characters", `/characters/${CHAR}`]));
  });

  it("refuses a sold persona", async () => {
    seed({ status: "sold" });
    expect(await delistListing(LISTING)).toEqual({ ok: false, error: "Sold personas belong to their buyer and can't be delisted." });
    expect(status()).toBe("sold");
  });

  it("refuses while someone is mid-checkout", async () => {
    seed({ status: "reserved", reserved_until: inFuture() });
    const r = await delistListing(LISTING);
    expect(r).toEqual({ ok: false, error: "Someone is checking out with this persona right now. Try again in a few minutes." });
    expect(status()).toBe("reserved");
  });

  it("allows it once the hold has expired", async () => {
    seed({ status: "reserved", reserved_until: inPast() });
    expect((await delistListing(LISTING)).ok).toBe(true);
    expect(status()).toBe("delisted");
  });

  it("refuses a draft, and treats an already-delisted persona as done", async () => {
    seed({ status: "draft" });
    expect((await delistListing(LISTING)).ok).toBe(false);
    expect(status()).toBe("draft");
    seed({ status: "delisted" });
    expect(await delistListing(LISTING)).toEqual({ ok: true });
  });

  it("says plainly when the listing doesn't exist", async () => {
    h.tables.marketplace_listings = [];
    expect(await delistListing(LISTING)).toEqual({ ok: false, error: "That listing couldn't be found." });
  });
});

describe("relistListing", () => {
  it("relists a delisted persona that has a snapshot and previews", async () => {
    seed({ status: "delisted" });
    expect(await relistListing(LISTING)).toEqual({ ok: true });
    expect(status()).toBe("available");
    expect(h.revalidated).toEqual(expect.arrayContaining(["/marketplace", "/characters", `/characters/${CHAR}`]));
  });

  it("only works from delisted", async () => {
    for (const s of ["available", "draft", "reserved"]) {
      seed({ status: s });
      expect((await relistListing(LISTING)).ok).toBe(false);
      expect(status()).toBe(s);
    }
    seed({ status: "sold" });
    expect((await relistListing(LISTING)).ok).toBe(false);
    expect(status()).toBe("sold");
  });

  it("asks the admin to press Publish when there is no snapshot", async () => {
    for (const full_assets of [null, {}, { face_sheet: null, references: [] }]) {
      seed({ status: "delisted", full_assets });
      const r = await relistListing(LISTING);
      expect(r).toEqual({ ok: false, error: "This listing isn't ready to go live. Open the character and press Publish." });
      expect(status()).toBe("delisted");
    }
  });

  it("accepts a snapshot that only has reference pictures", async () => {
    seed({ status: "delisted", full_assets: { face_sheet: null, references: [`${LISTING}/reference_0.jpg`] } });
    expect((await relistListing(LISTING)).ok).toBe(true);
  });

  it("asks the admin to press Publish when there are no previews", async () => {
    seed({ status: "delisted" });
    h.tables.listing_images = [];
    expect((await relistListing(LISTING)).ok).toBe(false);
    expect(status()).toBe("delisted");
  });
});

describe("setListingPrice", () => {
  it("saves a valid price and refreshes the marketplace", async () => {
    expect(await setListingPrice(LISTING, 3500)).toEqual({ ok: true });
    expect(h.tables.marketplace_listings[0].price_cents).toBe(3500);
    expect(h.revalidated).toContain("/marketplace");
  });

  it("enforces $0.50 to $100,000 in whole cents", async () => {
    for (const bad of [49, 10_000_001, 12.5, Number.NaN, "29" as any]) expect((await setListingPrice(LISTING, bad)).ok).toBe(false);
    expect(h.tables.marketplace_listings[0].price_cents).toBe(2900);
    expect((await setListingPrice(LISTING, 50)).ok).toBe(true);
    expect((await setListingPrice(LISTING, 10_000_000)).ok).toBe(true);
  });

  it("refuses a sold persona", async () => {
    seed({ status: "sold" });
    expect((await setListingPrice(LISTING, 3500)).ok).toBe(false);
    expect(h.tables.marketplace_listings[0].price_cents).toBe(2900);
  });

  it("lets the price change while reserved (the database keeps the buyer's reserved price)", async () => {
    seed({ status: "reserved", reserved_until: inFuture() });
    expect((await setListingPrice(LISTING, 4000)).ok).toBe(true);
  });
});
