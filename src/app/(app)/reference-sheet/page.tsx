import { ReferenceWizard } from "@/components/reference-wizard";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS } from "@/lib/limits";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { characterAvatars } from "@/lib/character-avatars";
import { PageIntro } from "@/components/page-intro";

export const metadata = { title: "Create Model" };

export default async function ReferenceSheetPage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  const { character } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("characters").select("id, name, profile_photo_path, reference_paths, face_sheet_path, body_sheet_path").order("name");
  const rows = data ?? [];
  const [urls, photos] = await Promise.all([signedUrlMap(supabase, rows.flatMap((c) => [c.face_sheet_path, c.body_sheet_path])), characterAvatars(supabase, rows)]);
  const image = (path: string | null) => (path && urls[path] ? { path, url: urls[path] } : null);
  const characters = rows.map((c) => ({ id: c.id, name: c.name, faceSheet: image(c.face_sheet_path), bodySheet: image(c.body_sheet_path), photo: photos.get(c.id) ?? null }));

  // The free plan allows one character, so a second persona can't be started from here.
  const atLimit = !(await entitlements.isUnlimited(user.id)) && rows.length >= FREE_LIMITS.characters;

  return (
    <div className="mx-auto max-w-4xl">
      <PageIntro title="Create Model">
        Create a persona step by step: her face, then her body, then the reference sheet that keeps both the same from one picture to the next.
      </PageIntro>
      <ReferenceWizard characters={characters} initialCharacterId={character} atLimit={atLimit} />
    </div>
  );
}
