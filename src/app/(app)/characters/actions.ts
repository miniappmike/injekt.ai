"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { characterInput, parseProfile, profilesEqual, type CharacterProfile } from "@/lib/characters";

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

  const { provenance: _p, ...fields } = parsed.data;
  const profile = parseProfile(formData);
  const { data, error } = await supabase
    .from("characters")
    .insert({ ...fields, user_id: user.id, profile, provenance_attested_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("character_profile_versions").insert({ character_id: data.id, version: 1, profile });
  revalidatePath("/characters");
  redirect(`/characters/${data.id}`);
}

export async function updateCharacter(id: string, _: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  const { supabase } = await requireUser();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: current, error: readError } = await supabase
    .from("characters")
    .select("profile, profile_version")
    .eq("id", id)
    .single();
  if (readError || !current) return { error: "Character not found" };

  const { provenance: _p, ...fields } = parsed.data;
  const profile = parseProfile(formData);
  const changed = !profilesEqual(current.profile as CharacterProfile, profile);
  const version = changed ? current.profile_version + 1 : current.profile_version;

  const { error } = await supabase
    .from("characters")
    .update({ ...fields, profile, profile_version: version, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  if (changed) {
    const { error: vError } = await supabase
      .from("character_profile_versions")
      .insert({ character_id: id, version, profile });
    if (vError) return { error: vError.message };
  }
  revalidatePath("/characters");
  redirect("/characters");
}

export async function deleteCharacter(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("characters").delete().eq("id", id);
  revalidatePath("/characters");
  redirect("/characters");
}
