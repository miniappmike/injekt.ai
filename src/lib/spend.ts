import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/ratelimit";
import { effectiveRole, providerSupports, readRoles, ROLES, type OwnRoleConfig, type RoleId } from "@/lib/ai/roles";
import { PROVIDER_LABELS } from "@/lib/ai/providers/detect";
import { getImageProvider } from "@/lib/ai/providers/registry";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { priceFor, roughRunCost, tokenCost, type PriceSource, type TokenPrice, type TokenUsage } from "@/lib/pricing";

export type TextFeature = "profile" | "prompt" | "likeness" | "variants" | "carousel" | "test";

export const TEXT_FEATURES: { id: TextFeature; label: string }[] = [
  { id: "profile", label: "Build profile" },
  { id: "prompt", label: "Write replacement prompt" },
  { id: "likeness", label: "Likeness check" },
  { id: "variants", label: "Variant edits" },
  { id: "carousel", label: "Carousel plan" },
];

const IMAGE_FEATURES: Record<string, string> = {
  inject: "Image · Inject",
  direct_swap: "Image · Direct swap",
  edit: "Image · Edit",
  variant: "Image · Variant",
  carousel: "Image · Carousel slide",
  face_fix: "Image · Face fix",
};

export const featureLabel = (feature: string) =>
  TEXT_FEATURES.find((f) => f.id === feature)?.label ?? (feature.startsWith("image:") ? IMAGE_FEATURES[feature.slice(6)] : undefined) ?? feature;

/** Start of the person's local day and month, as UTC times, given the browser's timezone offset (minutes behind UTC, like Date.getTimezoneOffset). */
export function spendWindows(now: Date, tzOffsetMinutes: number): { dayStart: Date; monthStart: Date } {
  const local = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const toUtc = (localMidnightMs: number) => new Date(localMidnightMs + tzOffsetMinutes * 60_000);
  return { dayStart: toUtc(Date.UTC(y, m, local.getUTCDate())), monthStart: toUtc(Date.UTC(y, m, 1)) };
}

// Records one text or vision call on the ledger. A call that can't be priced is still counted, marked as unpriced.
export async function recordTextUsage(
  db: SupabaseClient,
  e: {
    userId: string;
    job: "vision" | "llm";
    feature: TextFeature;
    provider: string;
    model: string;
    keySource: "byok" | "server";
    usage?: TokenUsage;
    price: TokenPrice | null;
  },
) {
  const cost = e.usage && e.price ? tokenCost(e.price, e.usage) : null;
  await db.from("usage_ledger").insert({
    user_id: e.userId,
    provider: e.provider,
    key_source: e.keySource,
    cost_usd: cost ?? 0,
    cost_known: cost !== null,
    job: e.job,
    feature: e.feature,
    model: e.model,
    input_tokens: e.usage?.inputTokens ?? null,
    output_tokens: e.usage?.outputTokens ?? null,
  });
}

export interface JobSpend {
  id: RoleId;
  label: string;
  setup: { provider: string; model: string; usesKeyOf?: string } | null;
  today: number;
  month: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  unpricedCalls: number;
  /** Text jobs: what each million tokens costs, and where that number came from. */
  price: (TokenPrice & { source: PriceSource }) | null;
}

export interface TypicalCost {
  feature: string;
  label: string;
  cost: number | null;
  runs: number;
  /** history: average of your latest runs. rough: an assumption, until you have runs. unknown: no price to go on. */
  basis: "history" | "rough" | "unknown";
}

export interface SpendOverview {
  jobs: JobSpend[];
  today: number;
  month: number;
  typical: TypicalCost[];
  provider?: { name: string; balance?: string; imagePrices?: { label: string; price: string }[] };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Summary = { job: string; day_cost: string; month_cost: string; month_calls: string; month_input_tokens: string; month_output_tokens: string; unpriced_calls: string };
type Typical = { feature: string; avg_cost: string; runs: number };

async function loadRoles(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return readRoles(data?.prefs);
}

/** The cost of each action, from the person's own recent runs where they have them. */
export function buildTypical(history: Typical[], textPrice: TokenPrice | null): TypicalCost[] {
  const byFeature = new Map(history.map((h) => [h.feature, h]));
  const text = TEXT_FEATURES.map<TypicalCost>(({ id, label }) => {
    const h = byFeature.get(id);
    if (h) return { feature: id, label, cost: num(h.avg_cost), runs: h.runs, basis: "history" };
    if (textPrice) return { feature: id, label, cost: roughRunCost(textPrice), runs: 0, basis: "rough" };
    return { feature: id, label, cost: null, runs: 0, basis: "unknown" };
  });
  const images = history
    .filter((h) => h.feature.startsWith("image:"))
    .map<TypicalCost>((h) => ({ feature: h.feature, label: featureLabel(h.feature), cost: num(h.avg_cost), runs: h.runs, basis: "history" }));
  return [...text, ...images];
}

export async function getTypicalCosts(supabase: SupabaseClient, userId: string): Promise<TypicalCost[]> {
  const roles = await loadRoles(supabase, userId);
  const vision = effectiveRole(roles, "vision");
  const { data } = await supabase.rpc("typical_costs");
  return buildTypical((data ?? []) as Typical[], vision ? priceFor(vision.cfg).price : null);
}

// What has been spent per job (with the person's own keys), what each job runs on, and what actions typically cost.
// With `details`, also asks the provider, for free, what is left in the account and what the image model charges.
export async function getSpendOverview(
  supabase: SupabaseClient,
  userId: string,
  opts: { tzOffsetMinutes: number; details?: boolean; now?: Date },
): Promise<SpendOverview> {
  const { dayStart, monthStart } = spendWindows(opts.now ?? new Date(), opts.tzOffsetMinutes);
  const roles = await loadRoles(supabase, userId);
  const [summary, typical] = await Promise.all([
    supabase.rpc("spend_summary", { p_day_start: dayStart.toISOString(), p_month_start: monthStart.toISOString() }),
    supabase.rpc("typical_costs"),
  ]);
  const byJob = new Map(((summary.data ?? []) as Summary[]).map((r) => [r.job, r]));

  const jobs = ROLES.map<JobSpend>((role) => {
    const row = byJob.get(role.id);
    const chosen = effectiveRole(roles, role.id);
    const priced = chosen && role.id !== "image" ? priceFor(chosen.cfg) : null;
    return {
      id: role.id,
      label: role.label,
      setup: chosen
        ? {
            provider: PROVIDER_LABELS[chosen.cfg.provider] ?? chosen.cfg.provider,
            model: chosen.cfg.model,
            ...(chosen.keyRole !== role.id ? { usesKeyOf: ROLES.find((r) => r.id === chosen.keyRole)?.label } : {}),
          }
        : null,
      today: num(row?.day_cost),
      month: num(row?.month_cost),
      calls: num(row?.month_calls),
      inputTokens: num(row?.month_input_tokens),
      outputTokens: num(row?.month_output_tokens),
      unpricedCalls: num(row?.unpriced_calls),
      price: priced?.price && priced.source ? { ...priced.price, source: priced.source } : null,
    };
  });

  const vision = effectiveRole(roles, "vision");
  const overview: SpendOverview = {
    jobs,
    today: jobs.reduce((a, j) => a + j.today, 0),
    month: jobs.reduce((a, j) => a + j.month, 0),
    typical: buildTypical((typical.data ?? []) as Typical[], vision ? priceFor(vision.cfg).price : null),
  };

  if (opts.details) overview.provider = await providerDetails(userId, roles).catch(() => undefined);
  return overview;
}

// Free look at the SpicyAPI account behind the person's keys, when they have one.
async function providerDetails(userId: string, roles: ReturnType<typeof readRoles>): Promise<SpendOverview["provider"]> {
  const isSpicy = (cfg: OwnRoleConfig) => cfg.provider === "spicyapi" || providerSupports(cfg, "image");
  const order: RoleId[] = ["image", "vision", "llm"];
  for (const id of order) {
    const chosen = effectiveRole(roles, id);
    if (!chosen || !isSpicy(chosen.cfg)) continue;
    await enforceRateLimit(userId, "spend-info", 12, 60);
    const { key } = await resolveApiKey(keyResolverDeps, userId, chosen.cfg.provider, chosen.keyRole);
    const imageCfg = effectiveRole(roles, "image");
    const info = await getImageProvider("spicyapi").info?.({ apiKey: key, model: imageCfg?.cfg.model ?? chosen.cfg.model });
    return { name: "SpicyAPI", balance: info?.balance, imagePrices: imageCfg ? info?.prices : undefined };
  }
  return undefined;
}
