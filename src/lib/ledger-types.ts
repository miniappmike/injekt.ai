import { PROVIDER_LABELS } from "@/lib/ai/providers/detect";
import { isSpicyHost, ROLES } from "@/lib/ai/roles";

// Pure helpers and types for the ledger, safe to use in the browser.

export type LedgerJob = "vision" | "llm" | "image";
export type CostSource = "provider" | "list_price" | "your_price";
export type TextFeature = "profile" | "sheet" | "prompt" | "outfit" | "cleanup" | "likeness" | "variants" | "carousel" | "condense" | "test";
export type LedgerRange = "today" | "week" | "month" | "all";

export const LEDGER_RANGES: { id: LedgerRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

export const COST_SOURCE_LABELS: Record<CostSource, string> = {
  provider: "Reported by the provider",
  list_price: "Tokens × the provider's list price",
  your_price: "Tokens × the price you entered",
};

const FEATURES: Record<string, string> = {
  profile: "Build profile",
  sheet: "Read reference sheet",
  condense: "Shorten image prompt",
  prompt: "Write replacement prompt",
  outfit: "Extract outfit",
  cleanup: "Clean up overlays",
  likeness: "Likeness check",
  variants: "Variant edits",
  carousel: "Carousel plan",
  test: "Test key",
  "image:inject": "Inject",
  "image:direct_swap": "Direct swap",
  "image:edit": "Edit",
  "image:variant": "Variant",
  "image:carousel": "Carousel slide",
  "image:face_fix": "Face fix",
  "image:likeness_fix": "Likeness fix",
  "image:reference_sheet": "Reference sheet",
};

export const featureLabel = (feature: string) => FEATURES[feature] ?? feature;
export const jobLabel = (job: string) => ROLES.find((r) => r.id === job)?.label ?? job;

/** The platform a setup talks to: its provider id, with a SpicyAPI address counted as SpicyAPI, and any other address by its host. */
export function platformOf(cfg: { provider: string; baseUrl?: string }): string {
  if (cfg.provider !== "custom") return cfg.provider;
  if (isSpicyHost(cfg.baseUrl)) return "spicyapi";
  try {
    return new URL(cfg.baseUrl ?? "").hostname;
  } catch {
    return "custom";
  }
}

export const platformLabel = (platform: string) => PROVIDER_LABELS[platform] ?? platform;

export interface LedgerEntry {
  id: number;
  createdAt: string;
  platform: string;
  job: LedgerJob;
  feature: string;
  model: string | null;
  keySource: "byok" | "server";
  status: "succeeded" | "failed";
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  costKnown: boolean;
  costSource: CostSource | null;
  generationId: string | null;
}

export interface PlatformSpend {
  platform: string;
  today: number;
  month: number;
  all: number;
  calls: number;
  monthCalls: number;
  inputTokens: number;
  outputTokens: number;
  unpricedCalls: number;
}

export interface LedgerFilters {
  platform?: string;
  job?: LedgerJob;
  range: LedgerRange;
}

// Spreadsheets run text that starts with = + - @ as a formula, so those cells are made harmless.
const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function ledgerCsv(entries: LedgerEntry[]): string {
  const head = ["Time (UTC)", "Platform", "Job", "What", "Model", "Input tokens", "Output tokens", "Cost (USD)", "Cost known", "Cost source", "Status", "Paid by"];
  const rows = entries.map((e) => [
    e.createdAt,
    platformLabel(e.platform),
    jobLabel(e.job),
    featureLabel(e.feature),
    e.model,
    e.inputTokens,
    e.outputTokens,
    e.costKnown ? e.costUsd : null,
    e.costKnown ? "yes" : "no",
    e.costSource ? COST_SOURCE_LABELS[e.costSource] : null,
    e.status,
    e.keySource === "byok" ? "You" : "Model Spawn",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
