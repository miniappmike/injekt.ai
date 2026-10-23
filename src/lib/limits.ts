// Free-plan limits. `characters` must match enforce_character_limit() in migration 0004
// (a test runs the real SQL against this number).
export const FREE_LIMITS = {
  characters: 1,
  /** Profile generation attempts, lifetime. */
  profile_builds: 3,
  /** Lifetime, and only with a verified email. */
  free_images: 1,
} as const;

export type AllowanceKey = Exclude<keyof typeof FREE_LIMITS, "characters">;

export type LimitKey = keyof typeof FREE_LIMITS | "prompt_writer";

const MESSAGES: Record<LimitKey, string> = {
  characters: `The free plan includes ${FREE_LIMITS.characters} character. Pro, with unlimited characters, is coming soon.`,
  profile_builds: `You've used all ${FREE_LIMITS.profile_builds} free profile generations. Pro, with unlimited generations, is coming soon.`,
  free_images: `The free plan includes ${FREE_LIMITS.free_images} image generation. Pro is coming soon.`,
  prompt_writer: "Prompt writing is part of Pro, which is coming soon.",
};

export const limitMessage = (key: LimitKey) => MESSAGES[key];
