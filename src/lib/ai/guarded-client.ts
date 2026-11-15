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
  const complete = async (task: { prompt: string; images?: string[] }, opts: { onDelta?: (text: string) => void; stopOnRefusal?: boolean } = {}) => {
    // A refusal is spotted in the first words and the call is hung up at once, instead of waiting for the model to
    // write out why it won't (which took minutes on long replies).
    const shouldStop = opts.stopOnRefusal ? (t: string) => t.length < 700 && looksLikeRefusal(t) : undefined;
    const result = await backend.complete({ text: withScope(task.prompt), images: task.images, apiKey, onDelta: opts.onDelta, shouldStop });
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
