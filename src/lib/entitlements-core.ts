import { FREE_LIMITS, type AllowanceKey } from "./limits";
import { LimitReachedError } from "./errors";

export interface EntitlementDeps {
  getProfile(userId: string): Promise<{ plan: "free" | "pro"; is_admin: boolean } | null>;
  /** Atomically uses one unit. Returns false when the limit is reached. */
  consume(userId: string, key: AllowanceKey, limit: number): Promise<boolean>;
  release(userId: string, key: AllowanceKey): Promise<void>;
  getUsage(userId: string): Promise<Partial<Record<AllowanceKey, number>>>;
}

export interface Allowance {
  /** Give the unit back, for example when the provider failed before doing any work. Safe to call twice. */
  release(): Promise<void>;
}

export function createEntitlements(deps: EntitlementDeps) {
  // A missing profile counts as free, so a lookup problem never grants extra access.
  const isUnlimited = async (userId: string) => {
    const p = await deps.getProfile(userId);
    return !!p && (p.is_admin || p.plan === "pro");
  };

  return {
    isUnlimited,

    /** Uses one unit of a lifetime allowance, or throws LimitReachedError on the free plan. */
    async useAllowance(userId: string, key: AllowanceKey): Promise<Allowance> {
      if (await isUnlimited(userId)) return { release: async () => {} };
      if (!(await deps.consume(userId, key, FREE_LIMITS[key]))) throw new LimitReachedError(key);
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          await deps.release(userId, key);
        },
      };
    },

    /** Features that are not part of the free plan at all. */
    async requirePro(userId: string, feature: "prompt_writer"): Promise<void> {
      if (!(await isUnlimited(userId))) throw new LimitReachedError(feature);
    },

    /** What is left, for showing in the UI. `null` means unlimited. */
    async remaining(userId: string): Promise<Record<AllowanceKey, number | null>> {
      if (await isUnlimited(userId)) return { profile_builds: null, free_images: null };
      const used = await deps.getUsage(userId);
      return {
        profile_builds: Math.max(FREE_LIMITS.profile_builds - (used.profile_builds ?? 0), 0),
        free_images: Math.max(FREE_LIMITS.free_images - (used.free_images ?? 0), 0),
      };
    },
  };
}

/** Free images need a confirmed email. */
export const isEmailVerified = (user: { email_confirmed_at?: string | null }) => !!user.email_confirmed_at;
