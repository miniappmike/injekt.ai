import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character-form";
import { ImageSlot } from "@/components/image-slot";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";
import type { CharacterProfile } from "@/lib/characters";
import { deleteCharacter, updateCharacter } from "../actions";

// The profile builder calls a vision model from this page.
export const maxDuration = 60;

const NOTICES: Record<string, { text: string; good: boolean }> = {
  saved: { text: "Character saved.", good: true },
  built: { text: "Character saved and profile generated. Check it below, edit anything, or generate it again.", good: true },
  no_images: { text: "Character saved. Add a face sheet, body sheet or reference image, then build the profile.", good: false },
  no_key: { text: "Character saved, but the profile wasn't built because no API key is set up yet. Add one under API keys, then click Build profile from images.", good: false },
  limit: { text: "Character saved, but you've used all your free profile generations.", good: false },
  failed: { text: "Character saved, but the profile couldn't be built this time. Click Build profile from images to try again and see why.", good: false },
};

export default async function EditCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const { supabase, user } = await requireUser();
  const { data: c } = await supabase
    .from("characters")
    .select("id, name, always_keep, height, weight, lore, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { profile_builds: buildsLeft } = await entitlements.remaining(user.id);
  const urls = await signedUrlMap(supabase, [c.profile_photo_path, c.face_sheet_path, c.body_sheet_path, ...c.reference_paths]);
  const imgs = (paths: (string | null)[]) => paths.filter((p): p is string => !!p && !!urls[p]).map((p) => ({ path: p, url: urls[p] }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit {c.name}</h1>
        <form action={deleteCharacter.bind(null, c.id)}>
          <Button type="submit" variant="destructive" size="sm">Delete</Button>
        </form>
      </div>

      {banner && (
        <p role="status" className={`mb-6 max-w-2xl rounded-md border p-3 text-sm ${banner.good ? "border-emerald-800 text-emerald-300" : "border-amber-700 text-amber-300"}`}>
          {banner.text}
        </p>
      )}

      <section className="mb-8 grid max-w-2xl gap-3">
        <h2 className="text-lg font-semibold">Images</h2>
        <p className="text-sm text-neutral-400">
          Click to upload, drop a file, or paste with Ctrl+V while a box is focused. Photo metadata (location, device) is stripped on upload.
          The profile photo is only for display and is never sent to an AI model.
        </p>
        <ImageSlot label="Profile photo" slot="profile_photo" characterId={c.id} images={imgs([c.profile_photo_path])} />
        <ImageSlot label="Face sheet" slot="face_sheet" characterId={c.id} images={imgs([c.face_sheet_path])} hint="A sheet of the face from several angles, or one clear face photo." />
        <ImageSlot label="Body sheet" slot="body_sheet" characterId={c.id} images={imgs([c.body_sheet_path])} hint="Front, back and side of the body." />
        <ImageSlot label="Reference images (up to 3)" slot="reference" characterId={c.id} images={imgs(c.reference_paths)} max={3} />
      </section>

      <CharacterForm
        action={updateCharacter.bind(null, c.id)}
        initial={{ ...c, profile: c.profile as CharacterProfile }}
        submitLabel="Save character"
        characterId={c.id}
        canBuildProfile={referenceList(c).length > 0}
        buildsLeft={buildsLeft}
        buildsTotal={FREE_LIMITS.profile_builds}
      />
    </div>
  );
}
