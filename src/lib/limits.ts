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
  free: { runs: 3, likeness: 1, images: 20 },
  // Pro has no daily limits; these stay for the config's shape (and older saved settings).
  pro: { runs: 100000, likeness: 100000, images: 100000 },
} as const;
export type DailyKey = keyof (typeof DAILY_LIMITS)["free"];

export type AllowanceKey = Exclude<keyof typeof FREE_LIMITS, "characters">;

export type ProFeature = "prompt_writer" | "likeness" | "variants";
export type LimitKey = keyof typeof FREE_LIMITS | ProFeature;

const MESSAGES: Record<LimitKey, string> = {
  characters: `The free plan includes ${FREE_LIMITS.characters} character. Upgrade to Pro for unlimited characters.`,
  profile_builds: `You've used all ${FREE_LIMITS.profile_builds} free profile generations. Upgrade to Pro for more.`,
  free_images: `The free plan includes ${FREE_LIMITS.free_images} image generation. Upgrade to Pro for more.`,
  prompt_writer: "Prompt writing is part of Pro.",
  likeness: "Likeness checks are part of Pro.",
  variants: "Variants and carousels are part of Pro.",
};

export const limitMessage = (key: LimitKey) => MESSAGES[key];
