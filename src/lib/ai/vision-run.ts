import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadForVision, referenceList } from "@/lib/character-images";
import { getUserTextClient } from "./text-client";
import type { TextFeature } from "@/lib/spend";
import type { CharacterProfile } from "@/lib/characters";
import type { LabeledImage } from "./tasks/profile-builder";

export interface VisionCharacter {
  name: string;
  height: string | null;
  weight: string | null;
  always_keep: string | null;
  profile: CharacterProfile;
}

// Shared set-up for tools that look at a character's reference images plus one or more new images.
export async function prepareVision(
  supabase: SupabaseClient,
  userId: string,
  characterId: string | null,
  extra: { label: string; path: string }[] = [],
  feature: TextFeature,
) {
  let character: VisionCharacter | null = null;
  let references: LabeledImage[] = [];
  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", feature);

  if (characterId) {
    const { data: c } = await supabase
      .from("characters")
      .select("name, height, weight, always_keep, profile, face_sheet_path, body_sheet_path, reference_paths")
      .eq("id", characterId)
      .maybeSingle();
    if (!c) throw new Error("Character not found");
    const refs = referenceList(c);
    if (!refs.length) throw new Error("This character needs a face sheet, body sheet or reference photo first.");
    character = { ...c, profile: c.profile as CharacterProfile };
    references = await loadForVision(supabase, refs, imageMaxEdge);
  }
  const extras = await loadForVision(supabase, extra, imageMaxEdge);
  return { client, character, references, extras };
}
