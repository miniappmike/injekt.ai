import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, shrinkForVision, toDataUri } from "./images";
import type { LabeledImage } from "./ai/tasks/profile-builder";

export interface CharacterImagePaths {
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
}

/** Images sent to vision models, in a fixed order. The profile photo is never included. */
export function referenceList(c: CharacterImagePaths): { label: string; path: string }[] {
  return [
    c.face_sheet_path && { label: "face sheet (identity reference)", path: c.face_sheet_path },
    c.body_sheet_path && { label: "body sheet (build reference)", path: c.body_sheet_path },
    ...c.reference_paths.map((path, i) => ({ label: `reference photo ${i + 1}`, path })),
  ].filter(Boolean) as { label: string; path: string }[];
}

/** Jobs that work from the character's sheets alone, so the photo being varied isn't crowded by loose reference photos. */
export const SHEETS_ONLY_JOBS = ["variant", "carousel"] as const;

/**
 * The character images a job uses, in @image order. Variants and carousels use only the face and body sheets (or her
 * first reference photo when there are no sheets, as the artifact does); everything else uses all of them. Prompt
 * writing and image generation both call this, so a prompt's @image numbers always match the images actually sent.
 */
export function referencesFor(job: string, c: CharacterImagePaths): { label: string; path: string }[] {
  const all = referenceList(c);
  if (!(SHEETS_ONLY_JOBS as readonly string[]).includes(job)) return all;
  const sheets = all.filter((r) => r.path === c.face_sheet_path || r.path === c.body_sheet_path);
  return sheets.length ? sheets : all.slice(0, 1);
}

export async function loadForVision(
  supabase: SupabaseClient,
  items: { label: string; path: string }[],
  maxEdge?: number,
): Promise<LabeledImage[]> {
  return Promise.all(
    items.map(async ({ label, path }) => {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
      if (error || !data) throw new Error(`Could not load ${label}`);
      const img = await shrinkForVision(Buffer.from(await data.arrayBuffer()), maxEdge);
      return { label, dataUri: toDataUri(img) };
    }),
  );
}
