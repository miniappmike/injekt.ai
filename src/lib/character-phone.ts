import type { SupabaseClient } from "@supabase/supabase-js";

/** Her phone, read on its own so everything still works before migration 0037 is run (then she has no phone). */
export async function loadPhone(supabase: SupabaseClient, characterId: string): Promise<{ description: string | null; path: string | null }> {
  const { data, error } = await supabase.from("characters").select("phone_description, phone_photo_path").eq("id", characterId).maybeSingle();
  if (error || !data) return { description: null, path: null };
  return { description: (data.phone_description as string | null) ?? null, path: (data.phone_photo_path as string | null) ?? null };
}
