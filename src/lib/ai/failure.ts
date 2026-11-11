import { ApiKeyRequiredError, DailyLimitError, InsufficientCreditsError, LimitReachedError, RateLimitError, UserFacingError } from "@/lib/errors";
import { limitMessage } from "@/lib/limits";
import { ProviderError } from "./providers/text";

/** `stop` marks failures that will repeat for every remaining item, so a batch stops instead of retrying each one. */
export type AiFailure = {
  ok: false;
  error: string;
  redirectTo?: string;
  stop?: "no_key" | "limit" | "rate_limited" | "credits";
  /** The image model was refused: the key may not use it, or it doesn't exist. */
  reason?: "model_not_allowed" | "model_not_found";
};

// Maps anything thrown during an AI call to a message that is safe to show the user.
export function toFailure(e: unknown): AiFailure {
  if (e instanceof ApiKeyRequiredError) return { ok: false, error: "Add an API key to continue.", redirectTo: e.redirectTo, stop: "no_key" };
  if (e instanceof LimitReachedError) return { ok: false, error: limitMessage(e.key), stop: "limit" };
  if (e instanceof DailyLimitError) return { ok: false, error: dailyLimitMessage(e), stop: "limit" };
  if (e instanceof InsufficientCreditsError) return { ok: false, error: creditsMessage(e), stop: "credits" };
  if (e instanceof RateLimitError) return { ok: false, error: `Too many requests. Try again in ${e.retryAfterSeconds}s.`, stop: "rate_limited" };
  if (e instanceof ProviderError) return { ok: false, error: e.message, ...(e.reason ? { reason: e.reason } : {}) };
  if (e instanceof UserFacingError) return { ok: false, error: e.message };
  console.error("ai call failed", e instanceof Error ? e.message : e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/** What to say when today's allowance is used up, and how to get more. */
export function dailyLimitMessage(e: Pick<DailyLimitError, "key" | "plan" | "limit" | "proLimit">): string {
  const one = e.limit === 1;
  const what = e.key === "runs" ? `prompt${one ? "" : "s"}` : e.key === "images" ? `image${one ? "" : "s"}` : `likeness check${one ? "" : "s"}`;
  return `You've used today's ${e.limit} ${what} on the free plan. They reset at midnight UTC. Pro has no daily limits: open your profile menu and choose Upgrade to Pro.`;
}

/** What to say when there aren't enough tokens. */
export function creditsMessage(e: Pick<InsufficientCreditsError, "needed" | "balance">): string {
  return `This needs ${e.needed} token${e.needed === 1 ? "" : "s"} and you have ${e.balance}. Buy more on the Tokens page (profile menu → Tokens).`;
}
