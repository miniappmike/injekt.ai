import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveRole, readRoles } from "@/lib/ai/roles";

/**
 * Image generation on the site is opt-in: a person adds their own Image key in Settings, then turns generation on
 * (with two confirmations). Without both, every tool writes prompts to paste into a generator instead.
 */
export function generationState(prefs: unknown): { hasImageKey: boolean; enabled: boolean; confirmed: boolean } {
  const hasImageKey = !!effectiveRole(readRoles(prefs), "image");
  const g = (prefs as { generation?: { enabled?: unknown; confirmed?: unknown } } | null)?.generation;
  const on = g?.enabled === true;
  // "Confirmed" means they have been through the two-step confirmation in Settings once (anyone who already had it on
  // counts). After that, the profile menu can switch it on again with one click.
  return { hasImageKey, enabled: hasImageKey && on, confirmed: g?.confirmed === true || on };
}

export async function loadGenerationState(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return generationState(data?.prefs);
}
