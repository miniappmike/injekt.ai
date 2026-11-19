import { describe, expect, it } from "vitest";
import { dailyLimitMessage } from "@/lib/ai/failure";
import { DAILY_LIMITS } from "@/lib/limits";
import { FREE_CREDITS, PRO } from "@/lib/plans";

describe("pricing and Pro fair-use limits", () => {
  it("gives 20 tokens at sign-up and prices Pro at 750 Stars", () => {
    expect(FREE_CREDITS).toBe(20);
    expect(PRO.stars).toBe(750);
  });

  it("caps Pro likeness checks at 200 a day by default, with no cap on prompts or images", () => {
    expect(DAILY_LIMITS.pro).toEqual({ runs: null, likeness: 200, images: null });
  });

  it("explains a Pro limit as fair use, and a free limit with what Pro gives", () => {
    expect(dailyLimitMessage({ key: "likeness", plan: "pro", limit: 200, proLimit: 200 })).toMatch(/200 likeness checks on Pro.*own AI key/);
    expect(dailyLimitMessage({ key: "likeness", plan: "free", limit: 1, proLimit: 200 })).toMatch(/Pro gives 200 a day/);
    expect(dailyLimitMessage({ key: "runs", plan: "free", limit: 3, proLimit: null })).toMatch(/Pro has no daily limit/);
  });
});
