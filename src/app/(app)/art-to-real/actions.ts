"use server";

import { requireUser } from "@/lib/auth";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { artToRealPrompt } from "@/lib/ai/prompts/art-to-real";
import { currentPack, selectCharacter } from "@/lib/sheet-pack";
import { swapRefs, type JobCharacter } from "@/lib/generation-job";
import { MEDIA_BUCKET } from "@/lib/images";

/**
 * The Art to Real prompt as text, for copying into another generator (image generation off), with the images to
 * attach in order: the artwork, then the character's references when one is picked. Costs nothing.
 */
export async function artToRealText(input: {
  characterId?: string | null;
  direction?: string;
}): Promise<{ ok: true; text: string; attach: { label: string; url: string | null }[] } | AiFailure> {
  try {
    const { supabase } = await requireUser();
    if (!input.characterId) return { ok: true, text: artToRealPrompt(null, input.direction), attach: [] };
    const c = await selectCharacter<JobCharacter>(supabase, input.characterId, "id, face_sheet_path, body_sheet_path, reference_paths, sheet_pack");
    if (!c) return { ok: false, error: "Character not found." };
    const { paths, R } = swapRefs(c, currentPack(c), 9);
    if (!paths.length) return { ok: false, error: "This character needs a reference sheet or photo first, or choose no character." };
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600);
    const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    return {
      ok: true,
      text: artToRealPrompt(R, input.direction),
      attach: paths.map((p, i) => ({ label: R.roles[i] ?? "her reference", url: urls.get(p) ?? null })),
    };
  } catch (e) {
    return toFailure(e);
  }
}
