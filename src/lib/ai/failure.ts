import { ApiKeyRequiredError, RateLimitError } from "@/lib/errors";
import { ProviderError } from "./providers/text";

export type AiFailure = { ok: false; error: string; redirectTo?: string };

// Maps anything thrown during an AI call to a message that is safe to show the user.
export function toFailure(e: unknown): AiFailure {
  if (e instanceof ApiKeyRequiredError) return { ok: false, error: "Add an API key to continue.", redirectTo: e.redirectTo };
  if (e instanceof RateLimitError) return { ok: false, error: `Too many requests. Try again in ${e.retryAfterSeconds}s.` };
  if (e instanceof ProviderError) return { ok: false, error: e.message };
  console.error("ai call failed", e instanceof Error ? e.message : e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
