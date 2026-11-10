import { describe, expect, it } from "vitest";
import { coverflowLook, daysSince, digitsOf, formatPrice, listedAgo, nearestIndex, slideStep, soldShare } from "@/lib/marketplace/view";

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
