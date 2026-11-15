"use server";

import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { HISTORY_LIMIT, historyRowImages, removeUnusedImages } from "@/lib/history";
import type { GenerationItem, HistoryItem } from "@/lib/history-types";
import { generationPreview, latestForHistory, listGenerations } from "@/lib/generation-list";
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
  const [urls, made] = await Promise.all([
    signedUrlMap(supabase, (rows ?? []).map((r) => r.image_path)),
    latestForHistory(supabase, (rows ?? []).map((r) => r.id as string)),
  ]);

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
    meta: (r.meta as Record<string, unknown> | null | undefined) ?? {},
    createdAt: r.created_at,
    generationId: made.get(r.id) ?? null,
  }));
}

// "Preview generation": fresh links to the image made from a prompt, or null once it has expired.
export async function getGenerationPreview(id: string) {
  const { supabase } = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return generationPreview(supabase, id);
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

/**
 * Deletes one generated image: the file goes from storage, and the row stays only as a record of the spend (cost, daily
 * counts) marked deleted, so it disappears from every list and its link stops working at once. Only the owner's own
 * finished or failed images; one still generating can't be deleted.
 */
export async function deleteGeneration(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { data } = await supabase.from("generations").select("id, status, output_path, params").eq("id", id).maybeSingle();
    if (!data) return { ok: false, error: "That image was already removed." };
    if (data.status !== "complete" && data.status !== "failed") return { ok: false, error: "Wait for the image to finish, then delete it." };
    const db = adminClient();
    if (data.output_path) {
      const { error } = await db.storage.from("generations").remove([data.output_path as string]);
      if (error) return { ok: false, error: "Couldn't delete the file. Try again." };
    }
    const { error } = await db
      .from("generations")
      .update({ output_path: null, params: { ...((data.params as Record<string, unknown> | null) ?? {}), deleted: true } })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: "Couldn't delete the image. Try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't delete the image. Try again." };
  }
}
