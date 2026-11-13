"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runCarousel, runVariants, type CarouselResult, type VariantResult } from "@/lib/variants-run";
import type { CarouselTypeId, PlatformId, VariantDimId } from "@/lib/variants-meta";
import { GENERATIONS_BUCKET } from "@/lib/generation";
import { MEDIA_BUCKET, stripAndNormalize } from "@/lib/images";
import { finalPath } from "@/lib/uploads";
import { safeFetchBytes } from "@/lib/ssrf";

type Ok<T> = ({ ok: true } & T) | AiFailure;

export async function writeVariantEdits(input: {
  imagePath: string;
  characterId?: string | null;
  dims: VariantDimId[];
  count?: number;
  note?: string;
  /** Up to 2 extra images (vibe, outfit) after the image to edit. */
  extraPaths?: string[];
}): Promise<Ok<VariantResult>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runVariants(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function planCarousel(input: {
  coverPath: string;
  characterId?: string | null;
  types: CarouselTypeId[];
  /** New slides after the cover, 1 to 5 (Write only: variations, 1 to 8). */
  count?: number;
  note?: string;
  extraPaths?: string[];
  /** Write only: finished prompts to paste into another generator, each with what to attach. */
  writeOnly?: boolean;
  /** Where the set will be posted (sets its tone and spice); `platformOther` names it for "other". */
  platform?: PlatformId | null;
  platformOther?: string;
}): Promise<Ok<CarouselResult>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runCarousel(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * The viewer's Variants button: a copy of one of the person's generated images as an uploaded image, so the Variants
 * page can use it like a picked file. Copied on the server, so it works for every image the site made, including one
 * that is still on the provider's link.
 */
export async function importGeneratedImage(generationId: string): Promise<Ok<{ path: string; preview: string }>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "upload", 30, 60);
    if (!/^[0-9a-f-]{36}$/i.test(generationId)) return { ok: false, error: "That image couldn't be found." };
    const { data: g } = await supabase.from("generations").select("output_path, status, params").eq("id", generationId).maybeSingle();
    if (!g || g.status !== "complete") return { ok: false, error: "That image isn't ready, or has expired." };
    let bytes: Buffer | null = null;
    if (g.output_path) {
      const { data: blob } = await supabase.storage.from(GENERATIONS_BUCKET).download(g.output_path as string);
      if (blob) bytes = Buffer.from(await blob.arrayBuffer());
    }
    // Our copy is still being saved: take it from the provider's link.
    const direct = (g.params as { output_url?: string } | null)?.output_url;
    if (!bytes && direct) bytes = Buffer.from((await safeFetchBytes(direct)).bytes);
    if (!bytes) return { ok: false, error: "That image has expired (images are kept for 72 hours)." };
    const clean = await stripAndNormalize(bytes);
    const path = finalPath(user.id, "targets");
    const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, clean, { contentType: "image/jpeg" });
    if (up.error) return { ok: false, error: "Couldn't copy the image. Try again." };
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    if (!signed) return { ok: false, error: "Couldn't copy the image. Try again." };
    return { ok: true, path, preview: signed.signedUrl };
  } catch (e) {
    return toFailure(e);
  }
}
