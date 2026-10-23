import { randomUUID } from "node:crypto";

// All media paths start with the owner's id so storage RLS can match on the first folder.
export const rawPath = (userId: string) => `${userId}/raw/${randomUUID()}`;
export const finalPath = (userId: string, folder: string) => `${userId}/${folder}/${randomUUID()}.jpg`;
export const isOwnRawPath = (userId: string, path: string) =>
  path.startsWith(`${userId}/raw/`) && !path.includes("..") && path.split("/").length === 3;
export const isOwnPath = (userId: string, path: string) =>
  path.startsWith(`${userId}/`) && !path.includes("..");

/** Images uploaded on the new-character page, before the character row exists. */
export const PENDING_FOLDER = "characters/pending";
export const isPendingPath = (userId: string, path: string) =>
  path.startsWith(`${userId}/${PENDING_FOLDER}/`) && !path.includes("..") && path.split("/").length === 4;

export interface DraftImages {
  profile_photo_path: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
}

// Reads the image paths the new-character form submits and keeps only the user's own pending uploads.
export function readDraftImages(formData: FormData, userId: string): { ok: true; images: DraftImages } | { ok: false; error: string } {
  const one = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v ? v : null;
  };
  const refs = [...new Set(formData.getAll("image_reference").map((v) => String(v).trim()).filter(Boolean))];
  const single = [one("image_profile_photo"), one("image_face_sheet"), one("image_body_sheet")];
  if ([...single, ...refs].some((p) => p && !isPendingPath(userId, p))) return { ok: false, error: "An uploaded image could not be used. Remove it and upload it again." };
  if (refs.length > 3) return { ok: false, error: "A character can have up to 3 reference images" };
  return { ok: true, images: { profile_photo_path: single[0], face_sheet_path: single[1], body_sheet_path: single[2], reference_paths: refs } };
}
