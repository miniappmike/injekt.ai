import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveRole, readRoles } from "@/lib/ai/roles";

/**
 * Image generation on the site is opt-in: a person adds their own Image key in Settings, then turns generation on
 * (with two confirmations). Without both, every tool writes prompts to paste into a generator instead.
 */
export function generationState(prefs: unknown): { hasImageKey: boolean; enabled: boolean } {
  const hasImageKey = !!effectiveRole(readRoles(prefs), "image");
  const on = (prefs as { generation?: { enabled?: unknown } } | null)?.generation?.enabled === true;
  return { hasImageKey, enabled: hasImageKey && on };
}

export async function loadGenerationState(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return generationState(data?.prefs);
}
