import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveRole, readRoles } from "@/lib/ai/roles";

/**
 * Image generation on the site is on unless the person switched it off in Settings (then every tool only writes prompts
 * to paste into a generator). Images are paid with credits, or on Pro with their own Image key. Credits are bought
 * up front, so turning it on needs no confirmation.
 */
export function generationState(prefs: unknown): { hasImageKey: boolean; enabled: boolean; confirmed: boolean } {
  const hasImageKey = !!effectiveRole(readRoles(prefs), "image");
  const g = (prefs as { generation?: { enabled?: unknown } } | null)?.generation;
  return { hasImageKey, enabled: g?.enabled !== false, confirmed: true };
}

export async function loadGenerationState(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return generationState(data?.prefs);
}
