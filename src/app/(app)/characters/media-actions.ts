"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/images";
import { isOwnPath, rawPath } from "@/lib/uploads";

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
  if (removed && isOwnPath(user.id, removed)) await supabase.storage.from(MEDIA_BUCKET).remove([removed]);
  revalidatePath(`/characters/${characterId}`);
}
