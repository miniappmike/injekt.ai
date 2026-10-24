import "server-only";
import { createGuardedClient } from "./guarded-client";
import { getTextBackend } from "./providers/text";
import { effectiveRole, readRoles } from "./roles";
import { resolveApiKey } from "@/lib/keys";
import { adminClient } from "@/lib/supabase/admin";
import { priceFor } from "@/lib/pricing";
import { recordTextUsage, type TextFeature } from "@/lib/spend";
import { keyResolverDeps } from "@/lib/key-store";
import { ApiKeyRequiredError } from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

// `feature` says what the call is for, which is how spend is broken down. Returns the guarded client for a role plus the image size the provider can take. A role with no
// setup of its own falls back to the other one. Throws ApiKeyRequiredError (redirecting to the key
// page) when neither is set.
export async function getUserTextClient(supabase: SupabaseClient, userId: string, role: "vision" | "llm", feature: TextFeature) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  const chosen = effectiveRole(readRoles(data?.prefs), role);
  if (!chosen) throw new ApiKeyRequiredError(role);

  const { cfg, keyRole } = chosen;
  const { key, source } = await resolveApiKey(keyResolverDeps, userId, cfg.provider, keyRole);
  const backend = getTextBackend(cfg.provider, cfg.model, cfg.baseUrl);
  const { price } = priceFor(cfg);
  // Every call is logged as it finishes, so the spend meter and cost hints stay current.
  const client = createGuardedClient(backend, key, {
    onUsage: (usage) =>
      recordTextUsage(adminClient(), { userId, job: role, feature, provider: cfg.provider, model: cfg.model, keySource: source, usage, price }),
  });
  return { client, imageMaxEdge: backend.imageMaxEdge };
}
