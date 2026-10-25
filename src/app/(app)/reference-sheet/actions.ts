"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { UserFacingError } from "@/lib/errors";
import { attachGeneratedSheet, SHEET_SLOTS } from "@/lib/reference-sheet";
import { toFailure, type AiFailure } from "@/lib/ai/failure";

const input = z.object({
  generationId: z.string().uuid(),
  characterId: z.string().uuid(),
  slot: z.enum(SHEET_SLOTS),
});

// Makes a finished sheet the character's face or body sheet.
export async function saveReferenceSheet(raw: unknown): Promise<({ ok: true; path: string; url: string } | AiFailure)> {
  try {
    const parsed = input.safeParse(raw);
    if (!parsed.success) throw new UserFacingError("That request wasn't valid.");
    const { supabase, user } = await requireUser();
    const saved = await attachGeneratedSheet(supabase, user, parsed.data);
    revalidatePath(`/characters/${parsed.data.characterId}`);
    return { ok: true, ...saved };
  } catch (e) {
    return toFailure(e);
  }
}
