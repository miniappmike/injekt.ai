"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { UserFacingError } from "@/lib/errors";
import { attachGeneratedSheet, SHEET_SLOTS } from "@/lib/reference-sheet";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { enforceRateLimit } from "@/lib/ratelimit";
import { limitMessage } from "@/lib/limits";

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

const personaInput = z.object({
  name: z.string().trim().min(1, "Give her a name first.").max(80, "That name is too long."),
  // The same promise the New character form asks for.
  attested: z.literal(true, { error: "Tick the box to confirm first." }),
});

/**
 * Starts a new persona from the reference sheet wizard: just her name for now (the sheets and photos are added as the
 * steps go). It's an ordinary character, so everything else in the app works with her straight away.
 */
export async function createPersona(raw: unknown): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const parsed = personaInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "persona-create", 10, 60);
    const { data, error } = await supabase
      .from("characters")
      .insert({ user_id: user.id, name: parsed.data.name, profile: {}, provenance_attested_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message.includes("character_limit_reached") ? limitMessage("characters") : "Couldn't start her. Try again." };
    }
    revalidatePath("/characters");
    return { ok: true, id: data.id as string, name: parsed.data.name };
  } catch (e) {
    // requireUser() redirects by throwing; let that through.
    if (e instanceof Error && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    const f = toFailure(e);
    return { ok: false, error: f.ok === false ? f.error : "Couldn't start her. Try again." };
  }
}
