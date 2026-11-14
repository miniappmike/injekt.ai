import { ArtToReal } from "@/components/art-to-real";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { characterAvatars } from "@/lib/character-avatars";
import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Art to Real" };

export default async function ArtToRealPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("characters").select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths").order("name");
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0, photo: photos.get(c.id) ?? null }));
  return (
    <div>
      <PageIntro title="Art to Real" short="Turn any artwork into a realistic photo.">
        Turn anime, a drawing, a render or any artwork into a realistic photo of a real woman: real skin, natural proportions, a real room, real clothes.
        Import one of your characters to put her in it instead.
      </PageIntro>
      <ArtToReal characters={characters} />
    </div>
  );
}
