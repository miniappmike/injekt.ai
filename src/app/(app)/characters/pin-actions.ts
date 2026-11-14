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

/** `slot` is the 1-based reference photo that was (or, when full, would be) replaced. */
export type PinResult = { ok: true; count: number; replaced: boolean; slot?: number } | { ok: false; full: true; count: number; slot: number } | AiFailure;

/** The character a generated image was made for, if it can be pinned to her (reference sheets have their own Save). */
export async function getPinTarget(generationId: string): Promise<string | null> {
  try {
    const { supabase } = await requireUser();
    const { data } = await supabase.from("generations").select("character_id, kind, status").eq("id", generationId).maybeSingle();
    if (!data?.character_id || data.kind === "reference_sheet" || data.status !== "complete") return null;
    return data.character_id as string;
  } catch {
    return null;
  }
}

/**
 * Pins a generated image to a character's reference photos (up to MAX_REFERENCE_PHOTOS). When she already has the
 * maximum, nothing happens unless `replaceLast` is set, which swaps out the next reference photo in the rotation. A vision check on the
 * person's own key (or the platform's) refuses images with nudity first. Pinned copies live under "<user>/pinned/" and
 * stay in storage when replaced or taken off her references; deleting the character or the account removes them.
 */
export async function pinToReferences(input: { generationId: string; characterId: string; replaceLast?: boolean }): Promise<PinResult> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "upload", 30, 60);
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("generations").select("output_path, status").eq("id", input.generationId).maybeSingle(),
      supabase.from("characters").select("*").eq("id", input.characterId).maybeSingle(),
    ]);
    if (!g?.output_path || g.status !== "complete") return { ok: false, error: "That image isn't ready, or has expired." };
    if (!c) return { ok: false, error: "Character not found." };
    const refs = c.reference_paths as string[];
    const full = refs.length >= MAX_REFERENCE_PHOTOS;
    // When she is full, replacements rotate through her photos: 1st, 2nd, ... last, then the 1st again. (`pin_cursor`
    // comes from migration 0028; without it the first photo is always the one replaced.)
    const hasCursor = "pin_cursor" in c;
    const slot = full ? Math.max(0, Number(c.pin_cursor ?? 0)) % MAX_REFERENCE_PHOTOS : refs.length;
    if (full && !input.replaceLast) return { ok: false, full: true, count: refs.length, slot: slot + 1 };

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
    // Full: the new image takes the next photo's place. The replaced file stays in storage until she is deleted.
    const next = full ? refs.map((r, i) => (i === slot ? path : r)) : [...refs, path];
    const { error: saveError } = await supabase
      .from("characters")
      .update({ reference_paths: next, ...(full && hasCursor ? { pin_cursor: (slot + 1) % MAX_REFERENCE_PHOTOS } : {}), updated_at: new Date().toISOString() })
      .eq("id", input.characterId);
    if (saveError) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return { ok: false, error: "Couldn't save the image. Try again." };
    }
    revalidatePath(`/characters/${input.characterId}`);
    revalidatePath("/characters");
    return { ok: true, count: next.length, replaced: full, slot: slot + 1 };
  } catch (e) {
    return toFailure(e);
  }
}
