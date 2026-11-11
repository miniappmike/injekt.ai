"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runProfileBuild } from "@/lib/ai/build-profile";
import type { CharacterProfile } from "@/lib/characters";

export type AiResult<T> = ({ ok: true } & T) | AiFailure;

const failure = toFailure;

/** Builds her profile from her images. runProfileBuild also reads her sheets into the sheet pack once it's saved. */
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
