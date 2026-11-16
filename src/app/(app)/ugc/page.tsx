import { HowItWorks } from "@/components/how-it-works";
import { UgcTool } from "@/components/ugc-tool";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { characterAvatars } from "@/lib/character-avatars";
import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "UGC" };

export default async function UgcPage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  const { supabase } = await requireUser();
  const { character } = await searchParams;
  const { data } = await supabase.from("characters").select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths").order("name");
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0, photo: photos.get(c.id) ?? null }));
  return (
    <div>
      <PageIntro title="UGC" short="Your model shows off a product, in one click.">
        Drop a photo of a product and pick a character. The product is read first, so the place, outfit and light fit it: a palm tree bucket hat lands on a sunny
        boardwalk, a tub of workout powder in a home gym. She poses with it in a photo that looks like it came off her own phone.
      </PageIntro>
      <HowItWorks steps={[
        { title: "Add the product", body: "One clear photo, or up to 4 angles of the same product." },
        { title: "Pick a character", body: "Her sheets keep her face and body the same." },
        { title: "Generate UGC", body: "The scene is planned from the product, then the photo is made." },
      ]} />
      <UgcTool characters={characters} initialCharacterId={characters.some((c) => c.id === character) ? character : undefined} />
    </div>
  );
}
