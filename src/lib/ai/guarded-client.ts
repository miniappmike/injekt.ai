import { withScope } from "./master-prompt";
import type { GuardedTextClient, TextBackend } from "./providers/types";
import type { TokenUsage } from "@/lib/pricing";

export interface GuardedClientOptions {
  /** Called after every successful call. `usage` is undefined when the provider did not report tokens. */
  onUsage?: (usage: TokenUsage | undefined) => void | Promise<void>;
}

// Wraps any vision/LLM backend so the SCOPE guard cannot be skipped.
export function createGuardedClient(backend: TextBackend, apiKey: string, options: GuardedClientOptions = {}): GuardedTextClient {
  const complete = async (task: { prompt: string; images?: string[] }) => {
    const result = await backend.complete({ text: withScope(task.prompt), images: task.images, apiKey });
    try {
      await options.onUsage?.(result.usage);
    } catch {
      // Tracking spend must never break the work the person asked for.
    }
    return { text: result.text, truncated: !!result.truncated };
  };
  return { complete, run: async (task) => (await complete(task)).text };
}
