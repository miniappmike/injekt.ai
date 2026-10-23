import "server-only";
import { createGuardedClient } from "./guarded-client";
import { getTextBackend } from "./providers/text";
import { effectiveRole, readRoles } from "./roles";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { ApiKeyRequiredError } from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

// Returns the guarded client for a role plus the image size the provider can take. A role with no
// setup of its own falls back to the other one. Throws ApiKeyRequiredError (redirecting to the key
// page) when neither is set.
export async function getUserTextClient(supabase: SupabaseClient, userId: string, role: "vision" | "llm" = "vision") {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  const chosen = effectiveRole(readRoles(data?.prefs), role);
  if (!chosen) throw new ApiKeyRequiredError(role);

  const { cfg, keyRole } = chosen;
  const { key } = await resolveApiKey(keyResolverDeps, userId, cfg.provider, keyRole);
  const backend = getTextBackend(cfg.provider, cfg.model, cfg.baseUrl);
  return { client: createGuardedClient(backend, key), imageMaxEdge: backend.imageMaxEdge };
}
