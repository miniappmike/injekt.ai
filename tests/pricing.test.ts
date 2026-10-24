import { describe, expect, it } from "vitest";
import { formatUsd, parsePrice, priceFor, roughRunCost, tokenCost, ROUGH_TEXT_RUN } from "@/lib/pricing";

describe("priceFor", () => {
  it("uses the provider's list price for models we have seen it for", () => {
    expect(priceFor({ provider: "anthropic", model: "claude-sonnet-5-5" })).toEqual({ price: { input: 2, output: 10 }, source: "list" });
    expect(priceFor({ provider: "spicyapi", model: "anthropic/claude-sonnet-5.5/chat" }).source).toBe("list");
    // A SpicyAPI key saved as an "other provider" gets the same price.
    expect(priceFor({ provider: "custom", baseUrl: "https://api.spicyapi.ai/v1", model: "anthropic/claude-sonnet-5.5/chat" }).source).toBe("list");
  });

  it("does not guess for anything else", () => {
    expect(priceFor({ provider: "openai", model: "gpt-4o" })).toEqual({ price: null, source: null });
    expect(priceFor({ provider: "custom", baseUrl: "https://api.groq.com/v1", model: "anthropic/claude-sonnet-5.5/chat" }).price).toBeNull();
    expect(priceFor({ provider: "anthropic", model: "claude-other" }).price).toBeNull();
  });

  it("lets the person's own numbers win", () => {
    expect(priceFor({ provider: "anthropic", model: "claude-sonnet-5-5", price: { input: 3, output: 15 } })).toEqual({ price: { input: 3, output: 15 }, source: "you" });
  });
});

describe("parsePrice", () => {
  it("accepts two sensible numbers, as text or numbers", () => {
    expect(parsePrice("2", "10")).toEqual({ input: 2, output: 10 });
    expect(parsePrice(0.5, "1.25")).toEqual({ input: 0.5, output: 1.25 });
    expect(parsePrice(0, 0)).toEqual({ input: 0, output: 0 });
  });
  it("rejects blanks, negatives, text and silly values", () => {
    expect(parsePrice("", "10")).toBeNull();
    expect(parsePrice("2", "  ")).toBeNull();
    expect(parsePrice("-1", "10")).toBeNull();
    expect(parsePrice("two", "10")).toBeNull();
    expect(parsePrice("2", "100000")).toBeNull();
    expect(parsePrice(undefined, "1")).toBeNull();
    expect(parsePrice("NaN", "1")).toBeNull();
  });
});

describe("tokenCost", () => {
  it("prices input and output separately, per million tokens", () => {
    expect(tokenCost({ input: 2, output: 10 }, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(2);
    expect(tokenCost({ input: 2, output: 10 }, { inputTokens: 0, outputTokens: 1_000_000 })).toBe(10);
    expect(tokenCost({ input: 2, output: 10 }, { inputTokens: 4000, outputTokens: 600 })).toBeCloseTo(0.014, 6);
    expect(tokenCost({ input: 2, output: 10 }, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
  it("keeps fractions of a cent", () => {
    expect(tokenCost({ input: 2, output: 10 }, { inputTokens: 61, outputTokens: 0 })).toBeCloseTo(0.000122, 6);
  });
  it("gives a rough whole-run figure from a stated assumption", () => {
    expect(ROUGH_TEXT_RUN).toEqual({ inputTokens: 10_000, outputTokens: 1_000 });
    expect(roughRunCost({ input: 2, output: 10 })).toBeCloseTo(0.03, 6);
  });
});

describe("formatUsd", () => {
  it("shows enough detail for tiny amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(NaN)).toBe("$0.00");
    expect(formatUsd(0.0004)).toBe("<$0.001");
    expect(formatUsd(0.0142)).toBe("$0.014");
    expect(formatUsd(0.5)).toBe("$0.500");
    expect(formatUsd(4.931)).toBe("$4.93");
  });
});
