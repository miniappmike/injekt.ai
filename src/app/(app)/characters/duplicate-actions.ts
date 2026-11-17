"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { MEDIA_BUCKET } from "@/lib/images";
import { selectCharacter } from "@/lib/sheet-pack";
import { planDuplicate, type DuplicateSource } from "@/lib/character-duplicate";

/**
 * Makes a second character with the same profile, measurements, lore, sheets, reference photos and read sheet pack.
 * Pro and admin accounts only. The images are copied to new files, so the two are independent afterwards.
 */
export async function duplicateCharacter(id: string): Promise<{ id?: string; name?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!(await entitlements.isUnlimited(user.id))) return { error: "Duplicating a character is a Pro feature." };

  const src = await selectCharacter<DuplicateSource>(
    supabase,
    id,
    "name, lore, always_keep, height, weight, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths, provenance_attested_at, sheet_pack",
  );
  if (!src) return { error: "Character not found" };

  const plan = planDuplicate(user.id, randomUUID(), src);
  const made: string[] = [];
  const undo = async () => {
    if (made.length) await supabase.storage.from(MEDIA_BUCKET).remove(made);
  };
  for (const { from, to } of plan.copies) {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).copy(from, to);
    if (error) {
      await undo();
      return { error: "Couldn't copy her images. Nothing was duplicated; try again." };
    }
    made.push(to);
  }

  const { error } = await supabase.from("characters").insert(plan.row);
  if (error) {
    await undo();
    return { error: error.message.includes("character_limit_reached") ? "Duplicating a character is a Pro feature." : error.message };
  }
  // Separate from the insert so a database without the sheet_pack column (migration 0010) still duplicates.
  if (plan.sheet_pack) await supabase.from("characters").update({ sheet_pack: plan.sheet_pack }).eq("id", plan.row.id);

  revalidatePath("/characters");
  return { id: plan.row.id, name: plan.row.name };
}
