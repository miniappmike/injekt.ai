import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const RECENT_KEEP = 40;
/** How many recent poses a prompt is told to avoid. */
export const RECENT_SEND = 20;

/** The person's recently used poses (artifact LS4), kept in their settings so every device avoids repeats. */
export async function recentPoses(supabase: SupabaseClient, userId: string): Promise<{ prefs: Record<string, unknown>; poses: string[] }> {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  const prefs = (data?.prefs as Record<string, unknown> | null) ?? {};
  const poses = Array.isArray(prefs.recentPoses) ? prefs.recentPoses.filter((p): p is string => typeof p === "string") : [];
  return { prefs, poses };
}

export async function rememberPoses(supabase: SupabaseClient, userId: string, added: string[]) {
  if (!added.length) return;
  // Read again just before writing, so a key saved meanwhile on the API keys page isn't overwritten.
  const { prefs, poses } = await recentPoses(supabase, userId);
  await supabase
    .from("user_settings")
    .update({ prefs: { ...prefs, recentPoses: [...poses, ...added.map((p) => p.slice(0, 160))].slice(-RECENT_KEEP) } })
    .eq("user_id", userId);
}

