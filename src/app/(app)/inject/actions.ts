"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { entitlements } from "@/lib/entitlements";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runInject, type InjectRunResult } from "@/lib/inject-run";
import { currentPack, ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import { PROMPT_LIMIT, refOptions, type JobCharacter } from "@/lib/generation-job";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { MEDIA_BUCKET, stripAndNormalize } from "@/lib/images";
import { addOutfit, type SavedOutfit } from "@/lib/outfits";
import type { InjectOptionsInput } from "@/lib/inject-meta";
import { finalPath, isOwnPath } from "@/lib/uploads";
import { loadForVision } from "@/lib/character-images";
import { getUserTextClient } from "@/lib/ai/text-client";
import { outfitPrompt } from "@/lib/ai/prompts/outfit";

// One target per call, so results show up as each one is written and no call runs past the time limit.
export async function writeInjectPrompts(input: { characterId: string; targetPath: string; options: InjectOptionsInput }): Promise<({ ok: true } & InjectRunResult) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "prompt_writer");
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await runInject(supabase, user.id, input)) };
  } catch (e) {
    return toFailure(e);
  }
}

/** Reads her sheet into the sheet pack in the background when she is picked (artifact warmPack). Never fails loudly. */
export async function warmSheetPack(characterId: string): Promise<void> {
  try {
    const { supabase, user } = await requireUser();
    if (!(await entitlements.isUnlimited(user.id))) return;
    const c = await selectCharacter<PackCharacter>(supabase, characterId, "id, face_sheet_path, body_sheet_path, sheet_pack");
    if (c) await ensureSheetPack(supabase, user.id, c);
  } catch {
    // Generate reads it anyway if this didn't.
  }
}

/** Reads the outfit off a photo as a prompt-ready wardrobe description (artifact A4), for the "Extracted outfit" wardrobe. */
export async function extractOutfit(input: { imagePath: string; who?: string }): Promise<{ ok: true; text: string } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "prompt_writer");
    await enforceRateLimit(user.id, "llm", 20, 60);
    if (!isOwnPath(user.id, input.imagePath)) return { ok: false, error: "That image couldn't be used. Upload it again." };
    const { client, imageMaxEdge } = await getUserTextClient(supabase, user.id, "vision", "outfit");
    const [img] = await loadForVision(supabase, [{ label: "outfit photo", path: input.imagePath }], Math.min(1024, imageMaxEdge ?? 1024));
    const raw = await client.run({ prompt: outfitPrompt(String(input.who ?? "").trim().slice(0, 200)), images: [img.dataUri] });
    const text = raw.trim().slice(0, 2000);
    return text ? { ok: true, text } : { ok: false, error: "No outfit was described. Try again." };
  } catch (e) {
    return toFailure(e);
  }
}

/** "Start from the swap prompt" in Edit (artifact A15): the swap prompt for the references the person picked. */
export async function swapPromptFor(input: { characterId: string; refs: string[]; who?: string }): Promise<{ ok: true; text: string } | AiFailure> {
  try {
    const { supabase } = await requireUser();
    const c = await selectCharacter<JobCharacter>(supabase, input.characterId, "id, face_sheet_path, body_sheet_path, reference_paths, sheet_pack");
    if (!c) return { ok: false, error: "Character not found." };
    const pack = currentPack(c);
    const picked = refOptions(c, pack).filter((o) => (input.refs ?? []).includes(o.id));
    if (!picked.length) return { ok: false, error: "Pick at least one of her references first." };
    const usesCrops = picked.some((o) => o.kind);
    const R = { roles: picked.map((o) => o.role), kinds: picked.map((o) => o.kind ?? ""), anchors: usesCrops ? (pack?.anchors ?? null) : null };
    return { ok: true, text: swapPrompt(R, { who: input.who, plen: PROMPT_LIMIT }) };
  } catch (e) {
    return toFailure(e);
  }
}

/** Saves a generated image as one of her reference photos (up to 3), from a direct swap result. */
export async function addToReferences(input: { generationId: string; characterId: string }): Promise<{ ok: true } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "upload", 30, 60);
    const { data: g } = await supabase.from("generations").select("output_path, status").eq("id", input.generationId).maybeSingle();
    if (!g?.output_path || g.status !== "complete") return { ok: false, error: "That image isn't ready, or has expired." };
    const { data: c } = await supabase.from("characters").select("reference_paths").eq("id", input.characterId).maybeSingle();
    if (!c) return { ok: false, error: "Character not found." };
    if ((c.reference_paths as string[]).length >= 3) return { ok: false, error: "She already has 3 reference photos. Remove one on her page first." };
    const { data: blob, error } = await supabase.storage.from("generations").download(g.output_path as string);
    if (error || !blob) return { ok: false, error: "Couldn't load the image. It may have expired." };
    const clean = await stripAndNormalize(Buffer.from(await blob.arrayBuffer()));
    const path = finalPath(user.id, `characters/${input.characterId}`);
    const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, clean, { contentType: "image/jpeg" });
    if (up.error) return { ok: false, error: "Couldn't save the image. Try again." };
    const { error: saveError } = await supabase
      .from("characters")
      .update({ reference_paths: [...(c.reference_paths as string[]), path], updated_at: new Date().toISOString() })
      .eq("id", input.characterId);
    if (saveError) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return { ok: false, error: "Couldn't save the image. Try again." };
    }
    return { ok: true };
  } catch (e) {
    return toFailure(e);
  }
}

export async function saveOutfit(input: { name: string; text: string }): Promise<{ ok: true; outfit: SavedOutfit } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    return { ok: true, outfit: await addOutfit(supabase, user.id, input) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function deleteOutfit(id: string): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.from("outfits").delete().eq("id", id);
}
