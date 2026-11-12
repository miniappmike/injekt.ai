import type { ImageResolution } from "@/lib/ai/providers/types";

/**
 * Prices and what each plan includes. One source for the Pro page, the credits page and every charge on the server.
 *
 * Free: 15 credits once (with a confirmed email), daily limits set on the admin page, no own keys.
 * Pro: $9.99 for 30 days. Own keys (BYOK), no daily limits, 220 credits the first month and 200 every month after.
 * Monthly credits run out with the month; bought credits never expire.
 */

export const FREE_CREDITS = 15;

/** Credits for one image made on the platform's key, by size. */
export const IMAGE_CREDITS: Record<ImageResolution, number> = { "1k": 2, "1.5k": 3, "2k": 4 };
/** Building a profile on the platform's key. */
export const PROFILE_BUILD_CREDITS = 2;
/** One prompt run on the platform's key: each target photo in Inject, or one press of Write variations/variant edits/Plan carousel. */
export const PROMPT_CREDITS = 1;

export const PRO = {
  priceCents: 999,
  /**
   * The price in Telegram Stars. Each price is an exact Stars bundle (iPhone only sells bundles at or above the price),
   * chosen so a phone buyer pays about the dollar price.
   */
  stars: 500,
  days: 30,
  firstMonthCredits: 220,
  monthlyCredits: 200,
  /** Days before the pass ends that the renewal reminder appears. */
  remindDays: 3,
} as const;

export interface CreditPack {
  id: string;
  priceCents: number;
  /** The price in Telegram Stars. */
  stars: number;
  credits: number;
  /** A short tag on the card. */
  tag?: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "pack-10", priceCents: 1000, stars: 500, credits: 200 },
  { id: "pack-25", priceCents: 2500, stars: 1500, credits: 525, tag: "Popular" },
  { id: "pack-50", priceCents: 5000, stars: 2500, credits: 1100 },
  { id: "pack-100", priceCents: 10000, stars: 5000, credits: 2300, tag: "Best value" },
];

export const packById = (id: string) => CREDIT_PACKS.find((p) => p.id === id) ?? null;

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Price per credit, e.g. "$0.048". */
export const perCredit = (p: CreditPack) => `$${(p.priceCents / 100 / p.credits).toFixed(3)}`;

/** Extra credits over the smallest pack's rate, as a percentage (0 for the smallest). */
export function bonusPercent(p: CreditPack): number {
  const base = CREDIT_PACKS[0].credits / CREDIT_PACKS[0].priceCents;
  return Math.round(((p.credits / p.priceCents) / base - 1) * 100);
}

export const imageCredits = (resolution: ImageResolution) => IMAGE_CREDITS[resolution];
