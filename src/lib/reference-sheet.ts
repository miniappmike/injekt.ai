import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/ratelimit";
import { UserFacingError } from "@/lib/errors";
import { GENERATIONS_BUCKET, type Actor } from "@/lib/generation";
import { MEDIA_BUCKET, stripAndNormalize } from "@/lib/images";
import { timeLeft } from "@/lib/retention";
import { finalPath, isOwnPath } from "@/lib/uploads";

export const SHEET_SLOTS = ["face_sheet", "body_sheet"] as const;
export type SheetSlot = (typeof SHEET_SLOTS)[number];

const COLUMN = { face_sheet: "face_sheet_path", body_sheet: "body_sheet_path" } as const;

// A finished sheet lives in the generations bucket and is deleted after 72 hours. Saving copies it into the character's
// own storage, where it stays, and makes it the character's face or body sheet (the old one is removed).
export async function attachGeneratedSheet(
  supabase: SupabaseClient,
  user: Actor,
  input: { generationId: string; characterId: string; slot: SheetSlot },
): Promise<{ path: string; url: string }> {
  await enforceRateLimit(user.id, "sheet-save", 20, 60);
  const column = COLUMN[input.slot];

  const { data: gen } = await supabase
    .from("generations")
    .select("id, kind, status, output_path, expires_at, character_id")
    .eq("id", input.generationId)
    .maybeSingle();
  if (!gen || gen.kind !== "reference_sheet") throw new UserFacingError("That sheet couldn't be found.");
  if (gen.status !== "complete" || !gen.output_path) throw new UserFacingError("That sheet isn't ready yet.");
  if (!gen.expires_at || timeLeft(gen.expires_at).expired) throw new UserFacingError("That sheet has expired. Make it again.");
  if (gen.character_id !== input.characterId) throw new UserFacingError("That sheet was made for a different character.");

  const { data: character } = await supabase.from("characters").select(`id, ${column}`).eq("id", input.characterId).maybeSingle();
  if (!character) throw new UserFacingError("Character not found.");
  const previous = (character as unknown as Record<string, string | null>)[column];

  const { data: blob, error: downloadError } = await supabase.storage.from(GENERATIONS_BUCKET).download(gen.output_path);
  if (downloadError || !blob) throw new UserFacingError("Couldn't load the sheet. Try again.");
  let clean: Buffer;
  try {
    clean = await stripAndNormalize(Buffer.from(await blob.arrayBuffer()));
  } catch {
    throw new UserFacingError("Couldn't read the sheet image. Make it again.");
  }

  const media = supabase.storage.from(MEDIA_BUCKET);
  const path = finalPath(user.id, `characters/${input.characterId}`);
  const { error: uploadError } = await media.upload(path, clean, { contentType: "image/jpeg" });
  if (uploadError) throw new UserFacingError("Couldn't save the sheet. Try again.");

  const { data: updated, error: updateError } = await supabase.from("characters").update({ [column]: path }).eq("id", input.characterId).select("id");
  if (updateError || !updated?.length) {
    // Nothing points at the new file, so don't leave it behind; the character keeps its old sheet.
    await media.remove([path]);
    throw new UserFacingError("Couldn't save the sheet. Try again.");
  }

  if (previous && previous !== path && isOwnPath(user.id, previous)) await media.remove([previous]);
  const { data: signed } = await media.createSignedUrl(path, 3600);
  return { path, url: signed?.signedUrl ?? "" };
}
