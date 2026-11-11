import { afterEach, describe, expect, it, vi } from "vitest";
import { spicyapiBackend } from "@/lib/ai/providers/text";
import { liveText, streamInjectPrompts } from "@/lib/inject-stream";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34" }]) }));
afterEach(() => vi.unstubAllGlobals());

/** A body that arrives in the given pieces, split wherever the test likes (mid-line included). */
function streamOf(pieces: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

describe("spicyapi streaming", () => {
  it("hands each piece to onDelta and returns the whole text with usage", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"===VER"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"SION 1===\\nHello"}}]}\n\ndata: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4}}\n\ndata: [DONE]\n\n',
    ];
    const fn = vi.fn(async () => new Response(streamOf(sse), { status: 200, headers: { "content-type": "text/event-stream", "x-spicy-task-id": "task_1" } }));
    vi.stubGlobal("fetch", fn);
    const seen: string[] = [];
    const out = await spicyapiBackend("anthropic/claude-sonnet-5.5/chat").complete({ text: "t", apiKey: "k", onDelta: (d) => seen.push(d) });
    expect(seen.join("")).toBe("===VERSION 1===\nHello there");
    expect(out.text).toBe("===VERSION 1===\nHello there");
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
    const body = JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.stream).toBe(true);
  });
});

describe("streamInjectPrompts", () => {
  it("reads pieces split across chunks and resolves with the result", async () => {
    const lines = [JSON.stringify({ t: "d", v: "Hel" }), JSON.stringify({ t: "d", v: "lo" }), JSON.stringify({ t: "done", result: { ok: false, error: "x" } })].join("\n") + "\n";
    const pieces = [lines.slice(0, 7), lines.slice(7, 30), lines.slice(30)];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(pieces), { status: 200 })));
    const seen: string[] = [];
    const res = await streamInjectPrompts({ characterId: "c", targetPath: "p", options: {} as never }, (d) => seen.push(d));
    expect(seen).toEqual(["Hel", "lo"]);
    expect(res).toEqual({ ok: false, error: "x" });
  });

  it("rejects when the stream ends without a result, so the caller recovers from History", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([JSON.stringify({ t: "d", v: "Hel" }) + "\n"]), { status: 200 })));
    await expect(streamInjectPrompts({ characterId: "c", targetPath: "p", options: {} as never }, () => {})).rejects.toThrow(/closed before/);
  });
});

describe("liveText", () => {
  it("turns version markers into headings and hides the working lines", () => {
    expect(liveText("===VERSION 1===\nPOSE: standing\nEDIT: x\nA woman stands.\n===VERSION 2===\nOUTFIT: y\nShe sits.")).toBe(
      "— Version 1 —\nA woman stands.\n\n— Version 2 —\nShe sits.",
    );
  });
});
