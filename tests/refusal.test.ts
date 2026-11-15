import { describe, expect, it } from "vitest";
import { createGuardedClient } from "@/lib/ai/guarded-client";
import { looksLikeRefusal, ModelDeclinedError } from "@/lib/ai/refusal";

const backend = (text: string) => ({ complete: async () => ({ text }), imageMaxEdge: 1024 }) as never;

describe("refusals", () => {
  it("spots a refusal, and never mistakes JSON, lists or real prompts for one", () => {
    expect(looksLikeRefusal("I'm not able to write this prompt. The photo shows a person in a swimsuit.")).toBe(true);
    expect(looksLikeRefusal("I can't help with that request.")).toBe(true);
    expect(looksLikeRefusal('{"verdict": "I can\'t write more", "variants": []}')).toBe(false);
    expect(looksLikeRefusal("Photo of a woman laughing; she can't stop smiling, hand on the table.")).toBe(false);
  });

  it("run() throws on a refusal wherever it is used; complete() hands the text back for callers that check it", async () => {
    const client = createGuardedClient(backend("I'm unable to write this prompt for that image."), "k");
    await expect(client.run({ prompt: "x" })).rejects.toBeInstanceOf(ModelDeclinedError);
    await expect(client.complete!({ prompt: "x" })).resolves.toMatchObject({ text: expect.stringContaining("unable") });
    await expect(createGuardedClient(backend('{"variants": []}'), "k").run({ prompt: "x" })).resolves.toBe('{"variants": []}');
  });
});
