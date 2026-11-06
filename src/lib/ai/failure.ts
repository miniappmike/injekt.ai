import { ApiKeyRequiredError, LimitReachedError, RateLimitError, UserFacingError } from "@/lib/errors";
import { limitMessage } from "@/lib/limits";
import { ProviderError } from "./providers/text";

/** `stop` marks failures that will repeat for every remaining item, so a batch stops instead of retrying each one. */
export type AiFailure = { ok: false; error: string; redirectTo?: string; stop?: "no_key" | "limit" | "rate_limited" };

// Maps anything thrown during an AI call to a message that is safe to show the user.
export function toFailure(e: unknown): AiFailure {
  if (e instanceof ApiKeyRequiredError) return { ok: false, error: "Add an API key to continue.", redirectTo: e.redirectTo, stop: "no_key" };
  if (e instanceof LimitReachedError) return { ok: false, error: limitMessage(e.key), stop: "limit" };
  if (e instanceof RateLimitError) return { ok: false, error: `Too many requests. Try again in ${e.retryAfterSeconds}s.`, stop: "rate_limited" };
  if (e instanceof ProviderError || e instanceof UserFacingError) return { ok: false, error: e.message };
  console.error("ai call failed", e instanceof Error ? e.message : e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
