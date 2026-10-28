"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { entitlements } from "@/lib/entitlements";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runInject, type InjectRunResult } from "@/lib/inject-run";
import { ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import type { InjectOptionsInput } from "@/lib/inject-meta";
import { isOwnPath } from "@/lib/uploads";
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
