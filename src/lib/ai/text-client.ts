import "server-only";
import { createGuardedClient } from "./guarded-client";
import { getTextBackend } from "./providers/text";
import { effectiveRole, readRoles } from "./roles";
import { resolveApiKey } from "@/lib/keys";
import { adminClient } from "@/lib/supabase/admin";
import { priceFor } from "@/lib/pricing";
import { recordTextCall, type TextFeature } from "@/lib/ledger";
import { keyResolverDeps } from "@/lib/key-store";
import { ApiKeyRequiredError } from "@/lib/errors";
import { env } from "@/env";
import { getAppConfig } from "@/lib/app-config";
import { canUseOwnKeys } from "@/lib/daily-limits";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Jobs that write (prompts, variants, slides, outfits) skip the model's thinking step, which made a prompt that takes
 * seconds to write take a minute or more. Jobs that judge or read images (likeness, profile, sheet, overlays) keep a
 * little thinking.
 */
const WRITING: ReadonlySet<TextFeature> = new Set(["prompt", "variants", "carousel", "outfit", "condense", "test"]);

// `feature` says what the call is for, which is how spend is broken down. Returns the guarded client for a role plus the
// image size the provider can take. A role with no setup of its own falls back to the other one, and with neither, to
// the platform's key (SPICY_API_KEY with SERVER_VISION_MODEL). Throws ApiKeyRequiredError only when there's no key at all.
export async function getUserTextClient(supabase: SupabaseClient, userId: string, role: "vision" | "llm", feature: TextFeature) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  // Own keys are a Pro feature: on the free plan a saved key is ignored and the platform's key does the job.
  const chosen = (await canUseOwnKeys(userId)) ? effectiveRole(readRoles(data?.prefs), role) : null;
  // No key of their own: the platform's key and model do the job (its daily allowance is checked by the caller).
  if (!chosen && !env.SPICY_API_KEY) throw new ApiKeyRequiredError(role);

  const server = chosen ? null : await getAppConfig();
  const cfg = chosen?.cfg ?? { provider: "spicyapi", model: server!.serverModel, ...(server!.serverPrice ? { price: server!.serverPrice } : {}) };
  const { key, source } = chosen
    ? await resolveApiKey(keyResolverDeps, userId, cfg.provider, chosen.keyRole)
    : { key: env.SPICY_API_KEY as string, source: "server" as const };
  const backend = getTextBackend(cfg.provider, cfg.model, cfg.baseUrl, WRITING.has(feature) ? "none" : "low");
  const price = priceFor(cfg);
  // Every call is written to the ledger as it finishes.
  const started = Date.now();
  const client = createGuardedClient(backend, key, {
    onUsage: (usage, taskIds) => {
      // How long each call took, in the server logs (Vercel → Logs), so slow models are easy to spot.
      console.info(`[ai] ${feature} · ${cfg.model} · ${((Date.now() - started) / 1000).toFixed(1)}s · ${usage ? `${usage.inputTokens} in / ${usage.outputTokens} out` : "no usage"}`);
      return recordTextCall(adminClient(), { userId, job: role, feature, setup: cfg, keySource: source, usage, price, taskIds, apiKey: key });
    },
  });
  return { client, imageMaxEdge: backend.imageMaxEdge, ownKey: !!chosen };
}
