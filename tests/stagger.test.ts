import { describe, expect, it } from "vitest";
import { GENERATE_STAGGER_MS, staggerDelay } from "@/lib/stagger";

describe("stagger", () => {
  it("starts one image every 5 seconds, which stays inside the 12 a minute limit", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(3 * GENERATE_STAGGER_MS);
    expect(staggerDelay(-1)).toBe(0);
    expect(60_000 / GENERATE_STAGGER_MS).toBeLessThanOrEqual(12);
  });
});
