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

export async function loadForVision(
  supabase: SupabaseClient,
  items: { label: string; path: string }[],
): Promise<LabeledImage[]> {
  return Promise.all(
    items.map(async ({ label, path }) => {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
      if (error || !data) throw new Error(`Could not load ${label}`);
      const img = await shrinkForVision(Buffer.from(await data.arrayBuffer()));
      return { label, dataUri: toDataUri(img) };
    }),
  );
}
