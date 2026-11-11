"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runProfileBuild } from "@/lib/ai/build-profile";
import { ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import type { CharacterProfile } from "@/lib/characters";

export type AiResult<T> = ({ ok: true } & T) | AiFailure;

const failure = toFailure;

/**
 * Builds her profile from her images, and at the same time reads her sheets into the sheet pack (the face and body
 * close-ups and her look in words that Generate sends). The read would otherwise happen on her first Generate; a
 * failed read never fails the build, and Generate tries it again.
 */
export async function buildProfile(characterId: string): Promise<AiResult<{ profile: CharacterProfile }>> {
  try {
    const { supabase, user } = await requireUser();
    const readPack = async () => {
      try {
        const c = await selectCharacter<PackCharacter>(supabase, characterId, "id, face_sheet_path, body_sheet_path, sheet_pack");
        if (c && (c.face_sheet_path || c.body_sheet_path)) await ensureSheetPack(supabase, user.id, c);
      } catch {
        // No vision key, or the read failed: Generate reads it later.
      }
    };
    const [result] = await Promise.all([runProfileBuild(supabase, user.id, characterId), readPack()]);
    if (result.ok) revalidatePath("/characters");
    return result;
  } catch (e) {
    return failure(e);
  }
}
