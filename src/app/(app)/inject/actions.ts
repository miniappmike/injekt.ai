"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runInject, type InjectRunResult } from "@/lib/inject-run";
import { runInjectStandalone, runSwapStandalone, type StandalonePrompt } from "@/lib/inject-standalone";
import { currentPack, ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import { PROMPT_LIMIT, refOptions, type JobCharacter } from "@/lib/generation-job";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { addOutfit, type SavedOutfit } from "@/lib/outfits";
import { cleanTarget, type CleanResult } from "@/lib/overlay-cleanup";
import type { InjectMeta, InjectOptionsInput } from "@/lib/inject-meta";
import { isOwnPath } from "@/lib/uploads";
import { loadForVision } from "@/lib/character-images";
import { getUserTextClient } from "@/lib/ai/text-client";
import { outfitPrompt } from "@/lib/ai/prompts/outfit";

// One target per call, so results show up as each one is written and no call runs past the time limit.
export async function writeInjectPrompts(input: { characterId: string; targetPath: string; options: InjectOptionsInput }): Promise<({ ok: true } & InjectRunResult) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    // One target photo is one run of today's allowance, given back if the writing fails.
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runInject(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * Write only: a target's versions as finished prompts for another generator, each with the images to attach. No AI
 * call; her sheet's words come from the saved sheet pack.
 */
export async function writeInjectStandalone(input: {
  characterId: string;
  targetPath?: string | null;
  cleaned?: boolean;
  versions: { text: string; meta: unknown }[];
}): Promise<{ ok: true; prompts: StandalonePrompt[] } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    return { ok: true, prompts: await runInjectStandalone(supabase, user.id, input) };
  } catch (e) {
    return toFailure(e);
  }
}

/** Direct swap, Write only: the swap prompt to paste, with her sheets first and the target last. No AI writing, so free. */
export async function writeSwapStandalone(input: { characterId: string; who?: string; extra?: string }): Promise<{ ok: true; prompt: StandalonePrompt } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    return { ok: true, prompt: await runSwapStandalone(supabase, user.id, input) };
  } catch (e) {
    return toFailure(e);
  }
}

/** Reads her sheet into the sheet pack in the background when she is picked (artifact warmPack). Never fails loudly. */
export async function warmSheetPack(characterId: string): Promise<void> {
  try {
    const { supabase, user } = await requireUser();
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

/** "Clean up overlays": a cleaned copy of a target photo, without app UI, watermarks or stickers (artifact A3). */
export async function cleanOverlays(path: string): Promise<({ ok: true } & CleanResult) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await cleanTarget(supabase, user.id, path)) };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * A prompt write whose answer never reached the phone (the page was in the background, or reloaded): the server
 * still finished it and saved every version to History, so rebuild the result from there. Null when nothing is
 * saved yet for this photo and character since the write started.
 */
export async function recoverInjectPrompts(input: { characterId: string; targetPath: string; since: string; count: number }): Promise<({ ok: true; result: InjectRunResult | null }) | AiFailure> {
  try {
    const { supabase } = await requireUser();
    const since = new Date(Date.parse(input.since) - 60_000).toISOString(); // a little slack for the phone's clock
    const [{ data: rows }, { data: c }] = await Promise.all([
      supabase
        .from("prompt_history")
        .select("*")
        .eq("kind", "inject")
        .eq("character_id", input.characterId)
        .eq("image_path", input.targetPath)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(input.count, 4))),
      supabase.from("characters").select("name").eq("id", input.characterId).maybeSingle(),
    ]);
    if (!rows?.length) return { ok: true, result: null };
    const name = (c?.name as string | undefined) ?? "";
    const versions = [...rows].reverse().map((r) => {
      // The label is "Inject · Name[ · version N][ · tag · tag]".
      const tags = String(r.label ?? "")
        .split(" · ")
        .slice(2)
        .filter((t) => !/^version \d+$/.test(t));
      return { text: String(r.prompt), fixed: [] as string[], tags, meta: (r.meta ?? {}) as InjectMeta, historyId: r.id as string };
    });
    return { ok: true, result: { versions, truncated: false, characterName: name } };
  } catch (e) {
    return toFailure(e);
  }
}
