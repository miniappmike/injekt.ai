// Free-plan limits. `characters` must match enforce_character_limit() in migration 0004
// (a test runs the real SQL against this number).
export const FREE_LIMITS = {
  characters: 1,
  /** 1 first build plus 3 rescans. */
  profile_builds: 4,
  /** Lifetime, and only with a verified email. */
  free_images: 1,
} as const;

export type AllowanceKey = Exclude<keyof typeof FREE_LIMITS, "characters">;

const MESSAGES: Record<keyof typeof FREE_LIMITS, string> = {
  characters: `The free plan includes ${FREE_LIMITS.characters} character. Pro, with unlimited characters, is coming soon.`,
  profile_builds: `You've used all ${FREE_LIMITS.profile_builds} free profile builds (1 build plus 3 rescans). Pro, with unlimited rebuilds, is coming soon.`,
  free_images: `The free plan includes ${FREE_LIMITS.free_images} image generation. Pro is coming soon.`,
};

export const limitMessage = (key: keyof typeof FREE_LIMITS) => MESSAGES[key];
