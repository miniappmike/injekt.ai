"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/images";
import { listGenerations } from "@/lib/generation-list";
import { isOwnPath, isPendingPath, isPinnedPath, rawPath } from "@/lib/uploads";

// Step 1 of an upload: hand the browser a one-time signed URL for a raw file in the user's folder.
export async function requestUpload(): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase, user } = await requireUser();
  const path = rawPath(user.id);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Could not start upload" };
  return { path, token: data.token };
}

const COLUMN = {
  profile_photo: "profile_photo_path",
  face_sheet: "face_sheet_path",
  body_sheet: "body_sheet_path",
} as const;

export async function removeCharacterImage(
  characterId: string,
  slot: keyof typeof COLUMN | "reference",
  path?: string,
) {
  const { supabase, user } = await requireUser();
  const { data: c } = await supabase
    .from("characters")
    .select("reference_paths, profile_photo_path, face_sheet_path, body_sheet_path")
    .eq("id", characterId)
    .maybeSingle();
  if (!c) return;

  let removed: string | null = null;
  if (slot === "reference") {
    if (!path || !c.reference_paths.includes(path)) return;
    removed = path;
    await supabase.from("characters").update({ reference_paths: c.reference_paths.filter((p: string) => p !== path) }).eq("id", characterId);
  } else {
    removed = c[COLUMN[slot]];
    await supabase.from("characters").update({ [COLUMN[slot]]: null }).eq("id", characterId);
  }
  // A pinned image stays in storage until she or the account is deleted; it is only taken off her references here.
  if (removed && isOwnPath(user.id, removed) && !isPinnedPath(removed)) await supabase.storage.from(MEDIA_BUCKET).remove([removed]);
  revalidatePath(`/characters/${characterId}`);
}

// Removes an image uploaded on the new-character page that was never attached to a character.
export async function removePendingImage(path: string) {
  const { supabase, user } = await requireUser();
  if (!isPendingPath(user.id, path)) return;
  await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

/** An image made for a character that is still on the server (the 72 hour limit hasn't passed). */
export interface CharacterGeneration {
  id: string;
  label: string;
  url: string;
  downloadUrl: string | null;
  prompt: string | null;
  expiresAt: string;
}

/**
 * The magnifier on a character's card: every image generated for her that is still there, newest first. Her reference
 * photos are a separate pack (what she has pinned), shown on her own page.
 */
export async function getCharacterGenerations(characterId: string): Promise<CharacterGeneration[]> {
  const { supabase, user } = await requireUser();
  const all = await listGenerations(supabase, user, 200);
  return all
    .filter((g) => g.characterId === characterId && g.state === "ready" && g.previewUrl)
    .map((g) => ({ id: g.id, label: g.kindLabel, url: g.previewUrl as string, downloadUrl: g.downloadUrl, prompt: g.prompt, expiresAt: g.expiresAt ?? new Date().toISOString() }));
}
