"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { MEDIA_BUCKET, shrinkForVision, stripAndNormalize, toDataUri } from "@/lib/images";
import { finalPath, MAX_REFERENCE_PHOTOS, pinnedFolder } from "@/lib/uploads";
import { getUserTextClient } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import { parsePinCheck, PIN_CHECK_PROMPT } from "@/lib/ai/prompts/pin";

export type PinResult = { ok: true; count: number; replaced: boolean } | { ok: false; full: true; count: number } | AiFailure;

/**
 * Pins a generated image to a character's reference photos (up to MAX_REFERENCE_PHOTOS). When she already has the
 * maximum, nothing happens unless `replaceLast` is set, which swaps out her last reference photo. A vision check on the
 * person's own key (or the platform's) refuses images with nudity first. Pinned copies live under "<user>/pinned/" and
 * are never deleted except with the account, even when they are replaced or the character is deleted.
 */
export async function pinToReferences(input: { generationId: string; characterId: string; replaceLast?: boolean }): Promise<PinResult> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "upload", 30, 60);
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("generations").select("output_path, status").eq("id", input.generationId).maybeSingle(),
      supabase.from("characters").select("reference_paths").eq("id", input.characterId).maybeSingle(),
    ]);
    if (!g?.output_path || g.status !== "complete") return { ok: false, error: "That image isn't ready, or has expired." };
    if (!c) return { ok: false, error: "Character not found." };
    const refs = c.reference_paths as string[];
    const full = refs.length >= MAX_REFERENCE_PHOTOS;
    if (full && !input.replaceLast) return { ok: false, full: true, count: refs.length };

    const { data: blob, error } = await supabase.storage.from("generations").download(g.output_path as string);
    if (error || !blob) return { ok: false, error: "Couldn't load the image. It may have expired." };
    const original = Buffer.from(await blob.arrayBuffer());

    // No nudity on a reference photo: checked by a vision model before anything is saved.
    await enforceRateLimit(user.id, "llm", 20, 60);
    const { client, imageMaxEdge } = await getUserTextClient(supabase, user.id, "vision", "pin");
    const img = toDataUri(await shrinkForVision(original, Math.min(1024, imageMaxEdge ?? 1024)));
    const check = parsePinCheck(await askJson(client, { prompt: PIN_CHECK_PROMPT, images: [img] }));
    if (!check.clear) {
      return { ok: false, error: `This image can't be pinned: reference photos can't show nudity${check.reason ? ` (${check.reason})` : ""}.` };
    }

    const path = finalPath(user.id, pinnedFolder(input.characterId));
    const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, await stripAndNormalize(original), { contentType: "image/jpeg" });
    if (up.error) return { ok: false, error: "Couldn't save the image. Try again." };
    // Full: the new image takes the last one's place. The replaced file stays in storage (see above).
    const next = full ? [...refs.slice(0, MAX_REFERENCE_PHOTOS - 1), path] : [...refs, path];
    const { error: saveError } = await supabase.from("characters").update({ reference_paths: next, updated_at: new Date().toISOString() }).eq("id", input.characterId);
    if (saveError) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return { ok: false, error: "Couldn't save the image. Try again." };
    }
    revalidatePath(`/characters/${input.characterId}`);
    revalidatePath("/characters");
    return { ok: true, count: next.length, replaced: full };
  } catch (e) {
    return toFailure(e);
  }
}
