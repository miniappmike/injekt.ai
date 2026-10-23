import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./images";

export const HISTORY_LIMIT = 100;
export type HistoryKind = "inject" | "likeness" | "variant" | "carousel";

export interface NewHistoryEntry {
  characterId?: string | null;
  kind: HistoryKind;
  label: string;
  prompt: string;
  imagePath?: string | null;
}

// Saves entries, then drops anything beyond the newest HISTORY_LIMIT along with its stored image.
export async function saveHistory(supabase: SupabaseClient, userId: string, entries: NewHistoryEntry[]) {
  if (!entries.length) return;
  await supabase.from("prompt_history").insert(
    entries.map((e) => ({
      user_id: userId,
      character_id: e.characterId ?? null,
      kind: e.kind,
      label: e.label.slice(0, 200),
      prompt: e.prompt.slice(0, 20000),
      image_path: e.imagePath ?? null,
    })),
  );

  const { data: extra } = await supabase
    .from("prompt_history")
    .select("id, image_path")
    .order("created_at", { ascending: false })
    .range(HISTORY_LIMIT, HISTORY_LIMIT + 500);
  if (extra?.length) {
    await supabase.from("prompt_history").delete().in("id", extra.map((r) => r.id));
    await removeUnusedImages(supabase, extra.map((r) => r.image_path));
  }
}

// Deletes stored images that no remaining history entry points to.
export async function removeUnusedImages(supabase: SupabaseClient, paths: (string | null)[]) {
  const candidates = [...new Set(paths.filter((p): p is string => !!p))];
  if (!candidates.length) return;
  const { data: stillUsed } = await supabase.from("prompt_history").select("image_path").in("image_path", candidates);
  const used = new Set((stillUsed ?? []).map((r) => r.image_path));
  const unused = candidates.filter((p) => !used.has(p));
  if (unused.length) await supabase.storage.from(MEDIA_BUCKET).remove(unused);
}
