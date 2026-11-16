import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrlMap } from "@/lib/media-urls";

interface AvatarSource {
  id: string;
  profile_photo_path?: string | null;
  reference_paths?: string[] | null;
  face_sheet_path?: string | null;
  body_sheet_path?: string | null;
}

/** `cover`: the first reference photo wins. `profile`: her profile photo wins (the small circles). */
export type AvatarPrefer = "cover" | "profile";

/** The picture the character picker shows for each character: her cover (first reference photo), else her profile photo, else a sheet. */
export async function characterAvatars(supabase: SupabaseClient, rows: AvatarSource[], prefer: AvatarPrefer = "cover"): Promise<Map<string, string>> {
  const pick = (c: AvatarSource) =>
    (prefer === "cover" ? c.reference_paths?.[0] || c.profile_photo_path : c.profile_photo_path || c.reference_paths?.[0]) || c.face_sheet_path || c.body_sheet_path || null;
  const urls = await signedUrlMap(supabase, rows.map(pick));
  const out = new Map<string, string>();
  for (const c of rows) {
    const p = pick(c);
    if (p && urls[p]) out.set(c.id, urls[p]);
  }
  return out;
}
