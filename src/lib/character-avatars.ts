import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrlMap } from "@/lib/media-urls";

interface AvatarSource {
  id: string;
  profile_photo_path?: string | null;
  reference_paths?: string[] | null;
  face_sheet_path?: string | null;
  body_sheet_path?: string | null;
}

/** The picture the character picker shows for each character: her profile photo, else her first reference, else a sheet. */
export async function characterAvatars(supabase: SupabaseClient, rows: AvatarSource[]): Promise<Map<string, string>> {
  const pick = (c: AvatarSource) => c.profile_photo_path || c.reference_paths?.[0] || c.face_sheet_path || c.body_sheet_path || null;
  const urls = await signedUrlMap(supabase, rows.map(pick));
  const out = new Map<string, string>();
  for (const c of rows) {
    const p = pick(c);
    if (p && urls[p]) out.set(c.id, urls[p]);
  }
  return out;
}
