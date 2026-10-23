"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { limitMessage } from "@/lib/limits";
import { isOwnPath, readDraftImages } from "@/lib/uploads";
import { MEDIA_BUCKET } from "@/lib/images";
import { characterInput, parseProfile } from "@/lib/characters";

export type CharacterFormState = { error?: string };

function parseForm(formData: FormData) {
  const parsed = characterInput.safeParse({
    name: formData.get("name") ?? "",
    always_keep: formData.get("always_keep") ?? "",
    height: formData.get("height") ?? "",
    weight: formData.get("weight") ?? "",
    lore: formData.get("lore") ?? "",
    provenance: formData.get("provenance") ?? undefined,
  });
  return parsed;
}

export async function createCharacter(_: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  const { supabase, user } = await requireUser();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const draft = readDraftImages(formData, user.id);
  if (!draft.ok) return { error: draft.error };

  const { provenance: _p, ...fields } = parsed.data;
  const profile = parseProfile(formData);
  const { data, error } = await supabase
    .from("characters")
    .insert({ ...fields, ...draft.images, user_id: user.id, profile, provenance_attested_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return { error: error.message.includes("character_limit_reached") ? limitMessage("characters") : error.message };

  revalidatePath("/characters");
  redirect(`/characters/${data.id}`);
}

export async function updateCharacter(id: string, _: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  const { supabase } = await requireUser();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { provenance: _p, ...fields } = parsed.data;
  const profile = parseProfile(formData);

  const { error } = await supabase
    .from("characters")
    .update({ ...fields, profile, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/characters");
  redirect("/characters");
}

export async function deleteCharacter(id: string) {
  const { supabase, user } = await requireUser();
  const { data: c } = await supabase
    .from("characters")
    .select("profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .eq("id", id)
    .maybeSingle();
  await supabase.from("characters").delete().eq("id", id);
  // Remove the character's stored images too, so deleted characters do not keep using storage.
  const files = [c?.profile_photo_path, c?.face_sheet_path, c?.body_sheet_path, ...(c?.reference_paths ?? [])].filter(
    (p): p is string => !!p && isOwnPath(user.id, p),
  );
  if (files.length) await supabase.storage.from(MEDIA_BUCKET).remove(files);
  revalidatePath("/characters");
  redirect("/characters");
}
