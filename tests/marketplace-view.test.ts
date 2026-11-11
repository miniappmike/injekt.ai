import { describe, expect, it } from "vitest";
import {
  canLoop,
  coverflowLook,
  daysSince,
  digitsOf,
  formatPrice,
  gridBadge,
  listedAgo,
  loopCopies,
  loopHome,
  loopShift,
  marketQuery,
  nearestIndex,
  nearestSlot,
  parseSort,
  parseView,
  slideStep,
  soldShare,
  sortListings,
  wrapIndex,
  type ListingStat,
  type PublicListing,
} from "@/lib/marketplace/view";

describe("formatPrice", () => {
  it("drops .00 and keeps real cents", () => {
    expect(formatPrice(2900)).toBe("$29");
    expect(formatPrice(2950)).toBe("$29.50");
    expect(formatPrice(129900)).toBe("$1,299");
    expect(formatPrice(50)).toBe("$0.50");
  });
});

describe("listing age", () => {
  const now = new Date("2026-01-10T12:00:00Z").getTime();
  it("counts whole days and words them plainly", () => {
    expect(daysSince("2026-01-10T01:00:00Z", now)).toBe(0);
    expect(daysSince("2026-01-05T12:00:00Z", now)).toBe(5);
    expect(daysSince("2027-01-01T00:00:00Z", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(listedAgo("2026-01-10T01:00:00Z", now)).toBe("Today");
    expect(listedAgo("2026-01-09T01:00:00Z", now)).toBe("Yesterday");
    expect(listedAgo("2026-01-05T12:00:00Z", now)).toBe("5 days ago");
  });
});

describe("soldShare", () => {
  it("is the sold part of the whole, and 0 for an empty shelf", () => {
    expect(soldShare({ available: 3, sold: 1 })).toBe(0.25);
    expect(soldShare({ available: 0, sold: 0 })).toBe(0);
    expect(soldShare({ available: 0, sold: 4 })).toBe(1);
  });
});

describe("coverflowLook", () => {
  it("is full size in the centre and shrinks, fades and darkens with distance, the same either side", () => {
    expect(coverflowLook(0)).toEqual({ scale: 1, opacity: 1, dim: 0 });
    const near = coverflowLook(1);
    const far = coverflowLook(2);
    expect(near.scale).toBeLessThan(1);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.opacity).toBeLessThan(near.opacity);
    expect(far.dim).toBeGreaterThan(near.dim);
    expect(coverflowLook(-1)).toEqual(near);
  });
  it("sits half-way between two looks mid-swipe", () => {
    const a = coverflowLook(0).scale;
    const b = coverflowLook(1).scale;
    expect(coverflowLook(0.5).scale).toBeCloseTo((a + b) / 2, 5);
  });
  it("never goes below a floor, however far away", () => {
    expect(coverflowLook(40).scale).toBeGreaterThan(0.7);
    expect(coverflowLook(40).opacity).toBeGreaterThanOrEqual(0.4);
  });
});

describe("nearestIndex", () => {
  it("snaps to the closest card and stays in range", () => {
    expect(nearestIndex(0, 300, 5)).toBe(0);
    expect(nearestIndex(140, 300, 5)).toBe(0);
    expect(nearestIndex(160, 300, 5)).toBe(1);
    expect(nearestIndex(99999, 300, 5)).toBe(4);
    expect(nearestIndex(-50, 300, 5)).toBe(0);
    expect(nearestIndex(10, 0, 5)).toBe(0);
    expect(nearestIndex(10, 300, 0)).toBe(0);
  });
});

describe("slideStep", () => {
  it("moves one picture, and reports running off either end", () => {
    expect(slideStep(1, 1, 4)).toEqual({ index: 2, edge: 0 });
    expect(slideStep(3, 1, 4)).toEqual({ index: 3, edge: 1 });
    expect(slideStep(0, -1, 4)).toEqual({ index: 0, edge: -1 });
    expect(slideStep(0, 1, 1)).toEqual({ index: 0, edge: 1 });
  });
});

describe("digitsOf", () => {
  it("splits a whole number", () => {
    expect(digitsOf(432)).toEqual([4, 3, 2]);
    expect(digitsOf(0)).toEqual([0]);
    expect(digitsOf(-5)).toEqual([0]);
  });
});

const L = (id: string, o: Partial<PublicListing> = {}): PublicListing => ({
  id, name: id, priceCents: 2900, status: "available", state: "available", holdActive: false, publishedAt: "2026-01-10T00:00:00Z",
  soldAt: null, tagline: "", bio: "", tags: [], images: [], ...o,
});
const S = (views: number, likes: number, rank: number | null): ListingStat => ({ views, likes, rank });

describe("sortListings", () => {
  const a = L("a", { priceCents: 5000, publishedAt: "2026-01-01T00:00:00Z" });
  const b = L("b", { priceCents: 1000, publishedAt: "2026-03-01T00:00:00Z" });
  const c = L("c", { priceCents: 3000, publishedAt: "2026-02-01T00:00:00Z" });
  const stats = { a: S(10, 1, 3), b: S(500, 9, 1), c: S(40, 99, 2) };
  const ids = (x: PublicListing[]) => x.map((l) => l.id).join("");
  it("trending puts rank 1 first", () => expect(ids(sortListings([a, b, c], stats, "trending"))).toBe("bca"));
  it("trending orders sold personas by views + likes", () => {
    const s1 = L("s1", { state: "sold" }), s2 = L("s2", { state: "sold" });
    expect(ids(sortListings([s1, s2], { s1: S(5, 5, null), s2: S(50, 1, null) }, "trending"))).toBe("s2s1");
  });
  it("newest, liked and price", () => {
    expect(ids(sortListings([a, b, c], stats, "newest"))).toBe("bca");
    expect(ids(sortListings([a, b, c], stats, "liked"))).toBe("cba");
    expect(ids(sortListings([a, b, c], stats, "price-low"))).toBe("bca");
    expect(ids(sortListings([a, b, c], stats, "price-high"))).toBe("acb");
  });
  it("never drops or mutates, and copes with missing stats", () => {
    const input = [a, b, c];
    const out = sortListings(input, {}, "trending");
    expect(out).toHaveLength(3);
    expect(ids(input)).toBe("abc");
  });
});

describe("sort and view in the address", () => {
  it("parses safely", () => {
    expect(parseSort("newest")).toBe("newest");
    expect(parseSort("nope")).toBe("trending");
    expect(parseSort(undefined)).toBe("trending");
    expect(parseView("grid")).toBe("grid");
    expect(parseView("x")).toBe("cards");
  });
  it("leaves defaults out", () => {
    expect(marketQuery({})).toBe("");
    expect(marketQuery({ tab: "available", sort: "trending", view: "cards" })).toBe("");
    expect(marketQuery({ tab: "sold", sort: "liked", view: "grid" })).toBe("?tab=sold&sort=liked&view=grid");
  });
});

describe("gridBadge", () => {
  const now = Date.parse("2026-01-12T00:00:00Z");
  it("sold, then top ten, then new, else none", () => {
    expect(gridBadge(L("x", { state: "sold" }), S(0, 0, null), now)?.text).toBe("SOLD");
    expect(gridBadge(L("x"), S(0, 0, 3), now)).toEqual({ kind: "rank", text: "#3" });
    expect(gridBadge(L("x"), S(0, 0, 11), now)?.kind).toBe("new");
    expect(gridBadge(L("x", { publishedAt: "2025-12-01T00:00:00Z" }), S(0, 0, 11), now)).toBeNull();
    expect(gridBadge(L("x", { publishedAt: "2025-12-01T00:00:00Z" }), S(0, 0, null), now)).toBeNull();
  });
});

describe("looping carousel maths", () => {
  it("only loops with three or more", () => {
    expect([1, 2, 3].map(canLoop)).toEqual([false, false, true]);
    expect([1, 2, 3, 5, 6, 20].map(loopCopies)).toEqual([1, 1, 5, 5, 3, 3]);
    expect(loopHome(2)).toBe(0);
    expect(loopHome(4)).toBe(8);
    expect(loopHome(7)).toBe(7);
  });
  it("wraps indexes", () => {
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(4, 4)).toBe(0);
    expect(wrapIndex(9, 4)).toBe(1);
  });
  it("picks the nearest copy of a persona", () => {
    // 4 personas, centred on slot 8 (first card, middle copy).
    expect(nearestSlot(1, 8, 4)).toBe(9);
    expect(nearestSlot(-1, 8, 4)).toBe(7);
    expect(nearestSlot(3, 8, 4)).toBe(7);
    expect(nearestSlot(4, 11, 4)).toBe(12);
    expect(nearestSlot(2, 8, 4)).toBe(10); // a tie goes forward
  });
  it("shifts back to the middle copy by whole copies", () => {
    expect(loopShift(8, 4)).toBe(0);
    expect(loopShift(11, 4)).toBe(0);
    expect(loopShift(2, 4)).toBe(8);
    expect(loopShift(15, 4)).toBe(-4);
    expect(loopShift(19, 4)).toBe(-8);
    expect(loopShift(2, 2)).toBe(0);
    expect(loopShift(5, 7)).toBe(7);
  });
});
