import { describe, expect, it } from "vitest";
import { emailKey, isDisposableEmail } from "@/lib/orders-core";
import { bonusPercent, CREDIT_PACKS, dollars, IMAGE_CREDITS, packById, perCredit, PRO } from "@/lib/plans";

describe("plans", () => {
  it("prices match the plan: 2/3/4 tokens per image, $9.99 Pro with 220 then 200", () => {
    expect(IMAGE_CREDITS).toEqual({ "1k": 2, "1.5k": 3, "2k": 4 });
    expect(PRO).toMatchObject({ priceCents: 999, firstMonthCredits: 220, monthlyCredits: 200, days: 30 });
    expect(CREDIT_PACKS.map((p) => [p.priceCents, p.credits])).toEqual([[1000, 200], [2500, 525], [5000, 1100], [10000, 2300]]);
  });

  it("works out the per-token price and how much more the bigger packs give", () => {
    expect(CREDIT_PACKS.map(bonusPercent)).toEqual([0, 5, 10, 15]);
    expect(perCredit(packById("pack-10")!)).toBe("$0.050");
    expect(dollars(999)).toBe("$9.99");
    expect(dollars(2500)).toBe("$25");
    expect(packById("nope")).toBeNull();
  });
});

describe("first-month bonus checks", () => {
  it("treats every spelling of one inbox as the same", () => {
    expect(emailKey(" Jane.Doe+promo@GoogleMail.com ")).toBe("janedoe@gmail.com");
    expect(emailKey("j.d+x@outlook.com")).toBe("j.d@outlook.com");
  });

  it("spots throwaway inboxes", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@eu.mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
  });
});
