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

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
