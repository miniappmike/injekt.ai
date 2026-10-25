"use server";

import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { HISTORY_LIMIT, historyRowImages, removeUnusedImages } from "@/lib/history";
import type { GenerationItem, HistoryItem } from "@/lib/history-types";
import { listGenerations } from "@/lib/generation-list";
import { signedUrlMap } from "@/lib/media-urls";

// Loaded each time the side panel opens, so new prompts are always there.
export async function getHistory(): Promise<HistoryItem[]> {
  const { supabase } = await requireUser();
  const [{ data: rows }, { data: characters }] = await Promise.all([
    supabase
      .from("prompt_history")
      // "*" so this works before and after migration 0009 adds extra_image_paths.
      .select("*")
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
    imagePath: r.image_path,
    extraPaths: (r.extra_image_paths as string[] | null | undefined) ?? [],
    createdAt: r.created_at,
  }));
}

// Free images left for the Generate buttons in the panel, or null for Pro and admin accounts (who use their own key).
export async function getFreeImagesLeft(): Promise<number | null> {
  const { user } = await requireUser();
  if (await entitlements.isUnlimited(user.id)) return null;
  return (await entitlements.remaining(user.id)).free_images;
}

// The Images tab: the person's generated images, newest first. Also finishes anything that completed while they were away.
export async function getGenerations(): Promise<GenerationItem[]> {
  const { supabase, user } = await requireUser();
  return listGenerations(supabase, user);
}

export async function deleteHistoryEntry(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("*").eq("id", id).maybeSingle();
  await supabase.from("prompt_history").delete().eq("id", id);
  if (data) await removeUnusedImages(supabase, historyRowImages(data));
}

export async function deleteAllHistory() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("*");
  await supabase.from("prompt_history").delete().not("id", "is", null);
  await removeUnusedImages(supabase, (data ?? []).flatMap(historyRowImages));
}
