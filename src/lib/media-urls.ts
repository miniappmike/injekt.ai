import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./images";

// Short-lived signed URLs for previews from the private bucket.
export async function signedUrlMap(supabase: SupabaseClient, paths: (string | null)[]): Promise<Record<string, string>> {
  const list = paths.filter((p): p is string => !!p);
  const out: Record<string, string> = {};
  if (!list.length) return out;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(list, 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
