"use client";

import type { InjectOptionsInput } from "@/lib/inject-meta";
import type { InjectRunResult } from "@/lib/inject-run";
import type { AiFailure } from "@/lib/ai/failure";

export type WriteResult = ({ ok: true } & InjectRunResult) | AiFailure;

/**
 * Writes one target's prompts through the streaming route, handing each piece of the model's text to `onDelta` as it
 * is written. Resolves with the same result as the writeInjectPrompts action; rejects if the connection breaks (the
 * caller then recovers the prompts from History).
 */
export async function streamInjectPrompts(
  input: { characterId: string; targetPath: string; options: InjectOptionsInput },
  onDelta: (text: string) => void,
): Promise<WriteResult> {
  const res = await fetch("/api/inject/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (res.redirected || res.url.includes("/login")) return { ok: false, error: "You were signed out. Sign in and try again.", redirectTo: "/login" };
  if (!res.ok || !res.body) throw new Error("Couldn't reach the prompt writer. Try again.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: WriteResult | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as { t: "d"; v: string } | { t: "done"; result: WriteResult };
    if (msg.t === "d") onDelta(msg.v);
    else result = msg.result;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.trim()) handle(buffer);
  if (!result) throw new Error("The connection closed before the prompts were finished.");
  return result;
}

/** The text so far as the card shows it: version markers become headings, and its working lines are left out. */
export function liveText(raw: string): string {
  return raw
    .replace(/^[ \t]*={2,}\s*VERSION\s*(\d+)\s*={2,}[ \t]*$/gim, "\n— Version $1 —")
    .replace(/^[ \t]*(?:POSE|IN FRAME|EDIT|OUTFIT|NUDITY):.*$\n?/gim, "")
    .replace(/^\n+/, "");
}
