"use server";

import { requireUser } from "@/lib/auth";
import { GENERATIONS_BUCKET } from "@/lib/generation";
import { featureLabel } from "@/lib/ledger-types";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

export interface LibraryImage {
  id: string;
  label: string;
  kind: string;
  url: string;
  downloadUrl: string | null;
  prompt: string | null;
  expiresAt: string;
  characterId: string | null;
}
export interface LibraryPage {
  images: LibraryImage[];
  total: number;
  /** Each character's name and how many reference photos she has, for Pin and the character names on tiles. */
  characters: { id: string; name: string; refCount: number }[];
  maxRefs: number;
}

/** One page of the person's active images (still inside their 72 hours), newest first. */
export async function listLibrary(input: { offset: number; limit: number }): Promise<LibraryPage> {
  const { supabase } = await requireUser();
  const limit = Math.min(Math.max(1, Math.floor(input.limit) || 10), 50);
  const offset = Math.max(0, Math.floor(input.offset) || 0);
  const now = new Date().toISOString();
  const [{ data, count }, { data: chars }] = await Promise.all([
    supabase
      .from("generations")
      .select("id, character_id, kind, prompt, output_path, expires_at", { count: "exact" })
      .eq("status", "complete")
      .not("output_path", "is", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("characters").select("id, name, reference_paths"),
  ]);

  const storage = supabase.storage.from(GENERATIONS_BUCKET);
  const images = (
    await Promise.all(
      (data ?? []).map(async (r): Promise<LibraryImage | null> => {
        const ttl = Math.max(60, Math.min(3600, Math.floor((new Date(r.expires_at as string).getTime() - Date.now()) / 1000)));
        const [view, save] = await Promise.all([
          storage.createSignedUrl(r.output_path as string, ttl),
          storage.createSignedUrl(r.output_path as string, ttl, { download: true }),
        ]);
        if (!view.data) return null;
        return {
          id: r.id as string,
          label: featureLabel(`image:${r.kind}`),
          kind: r.kind as string,
          url: view.data.signedUrl,
          downloadUrl: save.data?.signedUrl ?? null,
          prompt: (r.prompt as string | null) ?? null,
          expiresAt: r.expires_at as string,
          characterId: (r.character_id as string | null) ?? null,
        };
      }),
    )
  ).filter((x): x is LibraryImage => !!x);

  return {
    images,
    total: count ?? images.length,
    characters: (chars ?? []).map((c) => ({ id: c.id as string, name: c.name as string, refCount: (c.reference_paths as string[]).length })),
    maxRefs: MAX_REFERENCE_PHOTOS,
  };
}
