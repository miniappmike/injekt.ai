import "server-only";
import { createGuardedClient } from "./guarded-client";
import { getTextBackend } from "./providers/text";
import { getProvider, textProviders } from "./providers/catalog";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";
import { ApiKeyRequiredError } from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

// Builds the guarded client for the user's chosen text provider. Throws ApiKeyRequiredError
// (with a redirect to the key page) when the user has not added a key yet.
export async function getUserTextClient(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("user_settings")
    .select("default_llm_provider, prefs")
    .eq("user_id", userId)
    .maybeSingle();

  const provider = data?.default_llm_provider ?? textProviders()[0].id;
  const info = getProvider(provider);
  if (!info) throw new ApiKeyRequiredError(textProviders()[0].id);

  const model = (data?.prefs as { models?: Record<string, string> } | null)?.models?.[provider] ?? info.defaultModel;
  if (!model) throw new ApiKeyRequiredError(provider);

  const { key } = await resolveApiKey(keyResolverDeps, userId, provider);
  return createGuardedClient(getTextBackend(provider, model), key);
}
