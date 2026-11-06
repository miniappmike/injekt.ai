// Free-plan limits. `characters` must match enforce_character_limit() in migration 0004
// (a test runs the real SQL against this number).
export const FREE_LIMITS = {
  characters: 1,
  /** Profile generation attempts, lifetime. */
  profile_builds: 3,
  /** Lifetime, and only with a verified email. */
  free_images: 1,
} as const;

/**
 * Daily allowances for the prompt tools on the platform's AI key, reset at midnight UTC. A "run" is one target photo
 * written for in Inject, or one press of Write variant edits, Plan carousel or Write variations. Accounts that add
 * their own AI key aren't counted.
 */
export const DAILY_LIMITS = {
  free: { runs: 3, likeness: 1 },
  pro: { runs: 100, likeness: 30 },
} as const;
export type DailyKey = keyof (typeof DAILY_LIMITS)["free"];

export type AllowanceKey = Exclude<keyof typeof FREE_LIMITS, "characters">;

export type ProFeature = "prompt_writer" | "likeness" | "variants";
export type LimitKey = keyof typeof FREE_LIMITS | ProFeature;

const MESSAGES: Record<LimitKey, string> = {
  characters: `The free plan includes ${FREE_LIMITS.characters} character. Pro, with unlimited characters, is coming soon.`,
  profile_builds: `You've used all ${FREE_LIMITS.profile_builds} free profile generations. Pro, with unlimited generations, is coming soon.`,
  free_images: `The free plan includes ${FREE_LIMITS.free_images} image generation. Pro is coming soon.`,
  prompt_writer: "Prompt writing is part of Pro, which is coming soon.",
  likeness: "Likeness checks are part of Pro, which is coming soon.",
  variants: "Variants and carousels are part of Pro, which is coming soon.",
};

export const limitMessage = (key: LimitKey) => MESSAGES[key];
