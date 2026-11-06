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
  /** Up to 2 more images the prompt refers to after imagePath (vibe, outfit), sent with it when generating again. */
  extraPaths?: string[];
  /** What generating it again needs besides the text (Inject: in frame, outfit, the EDIT line, what may change). */
  meta?: Record<string, unknown>;
}

export const MAX_HISTORY_EXTRA_IMAGES = 2;

/** Every stored image a history row points to. Reads the extra images only if the column exists (migration 0009). */
export const historyRowImages = (r: { image_path: string | null; extra_image_paths?: string[] | null }) => [r.image_path, ...(r.extra_image_paths ?? [])];

// Saves entries, then drops anything beyond the newest HISTORY_LIMIT along with its stored image.
/** Saves the entries and returns their ids in the same order (null when they couldn't be saved). */
export async function saveHistory(supabase: SupabaseClient, userId: string, entries: NewHistoryEntry[]): Promise<(string | null)[]> {
  if (!entries.length) return [];
  // The extra-images column is only written when a batch has extras, so history keeps saving before migration 0009 is run.
  const withExtras = entries.some((e) => e.extraPaths?.length);
  const rows = entries.map((e) => ({
    user_id: userId,
    character_id: e.characterId ?? null,
    kind: e.kind,
    label: e.label.slice(0, 200),
    prompt: e.prompt.slice(0, 20000),
    image_path: e.imagePath ?? null,
    ...(withExtras ? { extra_image_paths: (e.extraPaths ?? []).slice(0, MAX_HISTORY_EXTRA_IMAGES) } : {}),
    ...(e.meta ? { meta: e.meta } : {}),
  }));
  let { data: saved, error } = await supabase.from("prompt_history").insert(rows).select("id");
  // Before migration 0010 there is no meta column: save the prompts without it rather than lose them.
  if (error && /\bmeta\b/.test(error.message))
    ({ data: saved, error } = await supabase.from("prompt_history").insert(rows.map(({ meta: _m, ...r }: Record<string, unknown>) => r)).select("id"));
  const ids = entries.map((_, i) => ((saved?.[i] as { id?: string } | undefined)?.id ?? null));

  const { data: extra } = await supabase
    .from("prompt_history")
    .select("*")
    .order("created_at", { ascending: false })
    .range(HISTORY_LIMIT, HISTORY_LIMIT + 500);
  if (extra?.length) {
    await supabase.from("prompt_history").delete().in("id", extra.map((r) => r.id));
    await removeUnusedImages(supabase, extra.flatMap(historyRowImages));
  }
  return ids;
}

// Deletes stored images that no remaining history entry points to.
export async function removeUnusedImages(supabase: SupabaseClient, paths: (string | null)[]) {
  const candidates = [...new Set(paths.filter((p): p is string => !!p))];
  if (!candidates.length) return;
  const [main, extras] = await Promise.all([
    supabase.from("prompt_history").select("image_path").in("image_path", candidates),
    supabase.from("prompt_history").select("extra_image_paths").overlaps("extra_image_paths", candidates),
  ]);
  // Never delete a file without being sure nothing uses it. Before migration 0009 there is no extra-images column, so
  // that lookup fails; then only files that were never extras (all of them, at that point) are checked against image_path.
  if (main.error) return;
  const used = new Set<string>((main.data ?? []).map((r) => r.image_path));
  if (!extras.error) for (const r of extras.data ?? []) for (const p of r.extra_image_paths ?? []) used.add(p);
  else if (!/extra_image_paths/.test(extras.error.message ?? "")) return;
  const unused = candidates.filter((p) => !used.has(p));
  if (unused.length) await supabase.storage.from(MEDIA_BUCKET).remove(unused);
}
