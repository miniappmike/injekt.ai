import { VariantsTool } from "@/components/variants-tool";
import { CreateCharacterFirst } from "@/components/inject-tabs";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { characterAvatars } from "@/lib/character-avatars";

// Calls a vision model with several images.
export const maxDuration = 60;

export default async function VariantsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("characters")
    .select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    ready: referenceList(c).length > 0,
    hasSheet: !!(c.face_sheet_path || c.body_sheet_path),
    photo: photos.get(c.id) ?? null,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="page-title">Variants</h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-neutral-400">
        Got an image you love? Get prompts for more like it: new poses, outfits and scenes of the same moment, or a whole carousel planned from one cover.
      </p>
      {characters.length ? <VariantsTool characters={characters} /> : <CreateCharacterFirst />}
    </div>
  );
}
