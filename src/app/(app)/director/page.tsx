import { DirectorTool } from "@/components/director-tool";
import { CreateCharacterFirst } from "@/components/inject-tabs";
import { requireUser } from "@/lib/auth";
import { characterAvatars } from "@/lib/character-avatars";
import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Director" };

// Pressing Generate writes the prompt with a text model before the image starts.
export const maxDuration = 120;

export default async function DirectorPage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  const { character } = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("characters").select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths").order("name");
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    // Director always sends both sheets, so she needs both.
    ready: !!c.face_sheet_path && !!c.body_sheet_path,
    photo: photos.get(c.id) ?? null,
  }));
  return (
    <div>
      <PageIntro title="Director" short="Describe the shot in your own words. We write the prompt.">
        Pick a character and say what you want to see, in your own words. The prompt is written for you behind the scenes, with her face and body sheets locked in.
      </PageIntro>
      {characters.length ? <DirectorTool characters={characters} initialCharacterId={characters.some((c) => c.id === character && c.ready) ? character : undefined} /> : <CreateCharacterFirst />}
    </div>
  );
}
