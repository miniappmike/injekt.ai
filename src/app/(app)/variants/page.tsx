import { VariantsTool } from "@/components/variants-tool";
import { CreateCharacterFirst } from "@/components/inject-tabs";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { characterAvatars } from "@/lib/character-avatars";
import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Variants" };

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
    <div>
      <PageIntro title="Variants" short="New takes of an image you love, or a day of moments built from it.">
        Got an image you love? Photoshoot makes new takes of the same scene, and Moments plans shots from throughout her day, built from this one.
      </PageIntro>
      {characters.length ? <VariantsTool characters={characters} /> : <CreateCharacterFirst />}
    </div>
  );
}
