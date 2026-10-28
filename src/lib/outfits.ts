import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";

export const MAX_OUTFITS = 50;
export interface SavedOutfit {
  id: string;
  name: string;
  text: string;
}

/** The person's saved outfits, newest first. Empty before migration 0011 runs. */
export async function listOutfits(supabase: SupabaseClient): Promise<SavedOutfit[]> {
  const { data, error } = await supabase.from("outfits").select("id, name, text").order("created_at", { ascending: false }).limit(MAX_OUTFITS);
  return error ? [] : ((data ?? []) as SavedOutfit[]);
}

export async function addOutfit(supabase: SupabaseClient, userId: string, input: { name: string; text: string }): Promise<SavedOutfit> {
  const name = String(input.name ?? "").trim().slice(0, 60);
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!name) throw new UserFacingError("Give the outfit a name.");
  if (!text) throw new UserFacingError("There's no outfit to save yet.");
  const { count } = await supabase.from("outfits").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_OUTFITS) throw new UserFacingError(`You can keep up to ${MAX_OUTFITS} outfits. Delete one first.`);
  const { data, error } = await supabase.from("outfits").insert({ user_id: userId, name, text }).select("id, name, text").single();
  if (error || !data) throw new UserFacingError("Couldn't save the outfit. Try again.");
  return data as SavedOutfit;
}
