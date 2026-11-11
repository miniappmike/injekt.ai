import { ArtToReal } from "@/components/art-to-real";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { characterAvatars } from "@/lib/character-avatars";

export const metadata = { title: "Art to Real" };

export default async function ArtToRealPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("characters").select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths").order("name");
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0, photo: photos.get(c.id) ?? null }));
  return (
    <div>
      <h1 className="page-title">Art to Real</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
        Turn anime, a drawing, a render or any artwork into a realistic photo of a real woman: real skin, natural proportions, a real room, real clothes.
        Import one of your characters to put her in it instead.
      </p>
      <ArtToReal characters={characters} />
    </div>
  );
}
