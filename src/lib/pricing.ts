import { isSpicyHost } from "./ai/roles";

/** Dollars per million tokens. */
export interface TokenPrice {
  input: number;
  output: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Only prices we have seen on the provider's own price page. Anything else is left for the person to enter,
// because a wrong built-in price is worse than none.
const LIST_PRICES: Record<string, TokenPrice> = {
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
  "spicyapi:anthropic/claude-sonnet-5.5/chat": { input: 2, output: 10 },
};

export type PriceSource = "you" | "list";

/** The price to use for a job: the person's own number wins, then the list price, otherwise unknown. */
export function priceFor(cfg: { provider: string; model: string; baseUrl?: string; price?: TokenPrice }): {
  price: TokenPrice | null;
  source: PriceSource | null;
} {
  if (cfg.price) return { price: cfg.price, source: "you" };
  const provider = cfg.provider === "custom" && isSpicyHost(cfg.baseUrl) ? "spicyapi" : cfg.provider;
  const listed = LIST_PRICES[`${provider}:${cfg.model}`];
  return listed ? { price: listed, source: "list" } : { price: null, source: null };
}

/** Checks the two numbers a person typed. Returns null when they can't be used. */
export function parsePrice(input: unknown, output: unknown): TokenPrice | null {
  const n = (v: unknown) => (typeof v === "string" && v.trim() === "" ? NaN : Number(v));
  const i = n(input);
  const o = n(output);
  const ok = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1000;
  return ok(i) && ok(o) ? { input: i, output: o } : null;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export const tokenCost = (price: TokenPrice, usage: TokenUsage) =>
  round6((usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000);

// Until there is history, a typical run is assumed to read a handful of images and write about a thousand tokens.
export const ROUGH_TEXT_RUN: TokenUsage = { inputTokens: 10_000, outputTokens: 1_000 };
export const roughRunCost = (price: TokenPrice) => tokenCost(price, ROUGH_TEXT_RUN);

export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.001) return "<$0.001";
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}
