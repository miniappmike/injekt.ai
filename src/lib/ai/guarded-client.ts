import { withScope } from "./master-prompt";
import { looksLikeRefusal, ModelDeclinedError } from "./refusal";
import type { GuardedTextClient, TextBackend } from "./providers/types";
import type { TokenUsage } from "@/lib/pricing";

export interface GuardedClientOptions {
  /** Called after every successful call. `usage` is undefined when the provider did not report tokens. */
  onUsage?: (usage: TokenUsage | undefined, taskIds?: string[]) => void | Promise<void>;
}

// Wraps any vision/LLM backend so the SCOPE guard cannot be skipped.
export function createGuardedClient(backend: TextBackend, apiKey: string, options: GuardedClientOptions = {}): GuardedTextClient {
  const complete = async (task: { prompt: string; images?: string[] }, opts: { onDelta?: (text: string) => void } = {}) => {
    const result = await backend.complete({ text: withScope(task.prompt), images: task.images, apiKey, onDelta: opts.onDelta });
    try {
      await options.onUsage?.(result.usage, result.taskIds);
    } catch {
      // Tracking spend must never break the work the person asked for.
    }
    return { text: result.text, truncated: !!result.truncated };
  };
  // run() is for answers that get used as they are, so a refusal is an error there (complete() hands back the raw text, for
// callers like Inject that check it themselves).
  return {
    complete,
    run: async (task) => {
      const { text } = await complete(task);
      if (looksLikeRefusal(text)) throw new ModelDeclinedError();
      return text;
    },
  };
}
