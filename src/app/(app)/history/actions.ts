"use server";

import { requireUser } from "@/lib/auth";
import { HISTORY_LIMIT, removeUnusedImages } from "@/lib/history";
import type { HistoryItem } from "@/lib/history-types";
import { signedUrlMap } from "@/lib/media-urls";

// Loaded each time the side panel opens, so new prompts are always there.
export async function getHistory(): Promise<HistoryItem[]> {
  const { supabase } = await requireUser();
  const [{ data: rows }, { data: characters }] = await Promise.all([
    supabase
      .from("prompt_history")
      .select("id, character_id, kind, label, prompt, image_path, created_at")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("characters").select("id, name"),
  ]);
  const names = new Map((characters ?? []).map((c) => [c.id, c.name]));
  const urls = await signedUrlMap(supabase, (rows ?? []).map((r) => r.image_path));

  return (rows ?? []).map((r) => ({
    id: r.id,
    characterId: r.character_id,
    characterName: r.character_id ? (names.get(r.character_id) ?? "Deleted character") : "No character",
    kind: r.kind,
    label: r.label,
    prompt: r.prompt,
    thumbnail: r.image_path ? (urls[r.image_path] ?? null) : null,
    createdAt: r.created_at,
  }));
}

export async function deleteHistoryEntry(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("image_path").eq("id", id).maybeSingle();
  await supabase.from("prompt_history").delete().eq("id", id);
  await removeUnusedImages(supabase, [data?.image_path ?? null]);
}

export async function deleteAllHistory() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("image_path");
  await supabase.from("prompt_history").delete().not("id", "is", null);
  await removeUnusedImages(supabase, (data ?? []).map((r) => r.image_path));
}
