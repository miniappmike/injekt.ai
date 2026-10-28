"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runProfileBuild } from "@/lib/ai/build-profile";
import { ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import { packStateText } from "@/lib/ai/prompts/identity";
import type { CharacterProfile } from "@/lib/characters";

export type AiResult<T> = ({ ok: true } & T) | AiFailure;

const failure = toFailure;

export async function buildProfile(characterId: string): Promise<AiResult<{ profile: CharacterProfile }>> {
  try {
    const { supabase, user } = await requireUser();
    const result = await runProfileBuild(supabase, user.id, characterId);
    if (result.ok) revalidatePath("/characters");
    return result;
  } catch (e) {
    return failure(e);
  }
}

/**
 * Reads her sheets into the sheet pack now (normally done on first Generate). Uses the person's own vision key; with
 * none, Generate keeps sending the whole sheet.
 */
export async function readSheet(characterId: string): Promise<AiResult<{ state: string; read: boolean }>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 10, 60);
    const c = await selectCharacter<PackCharacter>(supabase, characterId, "id, face_sheet_path, body_sheet_path, sheet_pack");
    if (!c) return { ok: false, error: "Character not found" };
    if (!c.face_sheet_path && !c.body_sheet_path) return { ok: false, error: "Add a face sheet or body sheet first." };
    const pack = await ensureSheetPack(supabase, user.id, c);
    revalidatePath(`/characters/${characterId}`);
    if (!pack) return { ok: false, error: "The sheet couldn't be read. Check that a Vision key is set up under API keys, then try again in a few minutes." };
    return { ok: true, read: true, state: packStateText({ hasBody: !!c.body_sheet_path, hasFace: !!c.face_sheet_path, pack }) };
  } catch (e) {
    return failure(e);
  }
}
