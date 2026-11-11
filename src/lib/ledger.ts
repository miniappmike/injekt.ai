import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenCost, type PriceSource, type TokenPrice, type TokenUsage } from "@/lib/pricing";
import { settleSoon } from "@/lib/ledger-settle";
import {
  platformOf,
  type CostSource,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerJob,
  type LedgerRange,
  type PlatformSpend,
  type TextFeature,
} from "@/lib/ledger-types";

export type { TextFeature };

const COST_SOURCE: Record<PriceSource, CostSource> = { list: "list_price", you: "your_price" };

/** Start of the person's local day and month, as UTC times, given the browser's timezone offset (minutes behind UTC, like Date.getTimezoneOffset). */
export function spendWindows(now: Date, tzOffsetMinutes: number): { dayStart: Date; monthStart: Date } {
  const local = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const toUtc = (localMidnightMs: number) => new Date(localMidnightMs + tzOffsetMinutes * 60_000);
  return { dayStart: toUtc(Date.UTC(y, m, local.getUTCDate())), monthStart: toUtc(Date.UTC(y, m, 1)) };
}

/** Where a list of entries should start for each range. `null` means no limit. */
export function rangeStart(range: LedgerRange, now: Date, windows: { dayStart: Date; monthStart: Date }): Date | null {
  if (range === "today") return windows.dayStart;
  if (range === "week") return new Date(now.getTime() - 7 * 86_400_000);
  if (range === "month") return windows.monthStart;
  return null;
}

export interface NewLedgerEntry {
  userId: string;
  platform: string;
  job: LedgerJob;
  feature: string;
  model?: string | null;
  keySource: "byok" | "server";
  status?: "succeeded" | "failed";
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** null when the call could not be priced */
  costUsd: number | null;
  costSource?: CostSource | null;
  generationId?: string | null;
  /** SpicyAPI tasks the call was charged under, so its real cost can be looked up (see ledger-settle). */
  providerTaskIds?: string[] | null;
  /** The cost is the provider's final charge. */
  costSettled?: boolean;
}

/** Writes one row on the ledger and returns its id. The server is the only thing that can; people can only read their own rows. */
export async function recordLedgerEntry(db: SupabaseClient, e: NewLedgerEntry): Promise<number | null> {
  const known = e.costUsd !== null;
  const base = {
    user_id: e.userId,
    platform: e.platform,
    job: e.job,
    feature: e.feature,
    model: e.model ?? null,
    key_source: e.keySource,
    status: e.status ?? "succeeded",
    input_tokens: e.inputTokens ?? null,
    output_tokens: e.outputTokens ?? null,
    cost_usd: e.costUsd ?? 0,
    cost_known: known,
    cost_source: known ? (e.costSource ?? null) : null,
    generation_id: e.generationId ?? null,
  };
  const settlement = { provider_task_ids: e.providerTaskIds?.length ? e.providerTaskIds : null, cost_settled: !!e.costSettled };
  let { data, error } = await db.from("api_ledger").insert({ ...base, ...settlement }).select("id").single();
  // Before migration 0021 the settlement columns don't exist: still record the call.
  if (error && /provider_task_ids|cost_settled/.test(error.message)) ({ data, error } = await db.from("api_ledger").insert(base).select("id").single());
  if (error) console.error("ledger write failed", error.message);
  return (data?.id as number | undefined) ?? null;
}

// A text or vision call: its cost is tokens x a price per million tokens (the list price, or the person's own).
// A call that can't be priced is still recorded, as unpriced.
export async function recordTextCall(
  db: SupabaseClient,
  e: {
    userId: string;
    job: "vision" | "llm";
    feature: TextFeature;
    setup: { provider: string; baseUrl?: string; model: string };
    keySource: "byok" | "server";
    usage?: TokenUsage;
    price: { price: TokenPrice | null; source: PriceSource | null };
    /** SpicyAPI: the tasks it was charged under, and the key that made them, to look up its real cost. */
    taskIds?: string[];
    apiKey?: string;
  },
) {
  const priced = e.usage && e.price.price && e.price.source;
  const platform = platformOf(e.setup);
  const taskIds = platform === "spicyapi" ? e.taskIds : undefined;
  const id = await recordLedgerEntry(db, {
    userId: e.userId,
    platform,
    job: e.job,
    feature: e.feature,
    model: e.setup.model,
    keySource: e.keySource,
    inputTokens: e.usage?.inputTokens,
    outputTokens: e.usage?.outputTokens,
    costUsd: priced ? tokenCost(e.price.price!, e.usage!) : null,
    costSource: priced ? COST_SOURCE[e.price.source!] : null,
    providerTaskIds: taskIds,
  });
  // The tokens x list price above is a stand-in until the provider's real charge is looked up.
  if (id !== null && taskIds?.length && e.apiKey) settleSoon(db, id, e.apiKey, taskIds);
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type SummaryRow = Record<"platform" | "day_cost" | "month_cost" | "all_cost" | "calls" | "month_calls" | "input_tokens" | "output_tokens" | "unpriced_calls", string> & {
  // Before migration 0021 these aren't returned.
  images?: string;
  month_images?: string;
};

/** What the person spent with their own keys, per platform. */
export async function getLedgerSummary(
  supabase: SupabaseClient,
  windows: { dayStart: Date; monthStart: Date },
  job?: LedgerJob,
): Promise<PlatformSpend[]> {
  const { data, error } = await supabase.rpc("ledger_summary", {
    p_day_start: windows.dayStart.toISOString(),
    p_month_start: windows.monthStart.toISOString(),
    p_job: job ?? null,
  });
  if (error) throw new Error("Couldn't read the ledger");
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    platform: r.platform,
    today: num(r.day_cost),
    month: num(r.month_cost),
    all: num(r.all_cost),
    calls: num(r.calls),
    monthCalls: num(r.month_calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    unpricedCalls: num(r.unpriced_calls),
    images: num(r.images),
    monthImages: num(r.month_images),
  }));
}

const COLUMNS = "id, created_at, platform, job, feature, model, key_source, status, input_tokens, output_tokens, cost_usd, cost_known, cost_source, generation_id";

type EntryRow = {
  id: number;
  created_at: string;
  platform: string;
  job: LedgerJob;
  feature: string;
  model: string | null;
  key_source: "byok" | "server";
  status: "succeeded" | "failed";
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | number;
  cost_known: boolean;
  cost_source: CostSource | null;
  generation_id: string | null;
};

export const toLedgerEntry = (r: EntryRow): LedgerEntry => ({
  id: r.id,
  createdAt: r.created_at,
  platform: r.platform,
  job: r.job,
  feature: r.feature,
  model: r.model,
  keySource: r.key_source,
  status: r.status,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  costUsd: num(r.cost_usd),
  costKnown: r.cost_known,
  costSource: r.cost_source,
  generationId: r.generation_id,
});

/** Newest first. `afterId` asks for what is newer than an entry already shown, `beforeId` for the next older page. */
export async function getLedgerEntries(
  supabase: SupabaseClient,
  o: { platform?: string; job?: LedgerJob; since?: Date | null; afterId?: number; beforeId?: number; limit: number },
): Promise<{ entries: LedgerEntry[]; hasMore: boolean }> {
  let q = supabase.from("api_ledger").select(COLUMNS).order("id", { ascending: false }).limit(o.limit + 1);
  if (o.platform) q = q.eq("platform", o.platform);
  if (o.job) q = q.eq("job", o.job);
  if (o.since) q = q.gte("created_at", o.since.toISOString());
  if (o.afterId) q = q.gt("id", o.afterId);
  if (o.beforeId) q = q.lt("id", o.beforeId);
  const { data, error } = await q;
  if (error) throw new Error("Couldn't read the ledger");
  const rows = (data ?? []) as EntryRow[];
  return { entries: rows.slice(0, o.limit).map(toLedgerEntry), hasMore: rows.length > o.limit };
}

export type { LedgerFilters };
