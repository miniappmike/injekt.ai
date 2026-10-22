import { buildSystemPrompt } from "./master-prompt";
import type { GuardedTextClient, TextBackend } from "./providers/types";

// Wraps any vision/LLM backend so the master prompt cannot be skipped.
export function createGuardedClient(backend: TextBackend, apiKey: string): GuardedTextClient {
  return {
    run: (task) =>
      backend.complete({
        system: buildSystemPrompt(task.instructions),
        text: task.text,
        images: task.images,
        apiKey,
      }),
  };
}
