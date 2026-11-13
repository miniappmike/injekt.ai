import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character-form";
import { ImageSlot } from "@/components/image-slot";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { hasOwnAiKey } from "@/lib/daily-limits";
import { PROFILE_BUILD_CREDITS } from "@/lib/plans";
import { FREE_LIMITS } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";
import { selectCharacter } from "@/lib/sheet-pack";
import type { CharacterProfile } from "@/lib/characters";
import { ListingEditor, type OwnImage } from "@/components/listing-editor";
import { loadEditorListing } from "@/lib/marketplace/admin-data";
import { deleteCharacter, updateCharacter } from "../actions";

// The profile builder calls a vision model from this page.
export const maxDuration = 60;

interface CharacterRow {
  id: string;
  name: string;
  always_keep: string | null;
  height: string | null;
  weight: string | null;
  lore: string | null;
  profile: unknown;
  profile_photo_path: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
}

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
  searchParams: Promise<{ notice?: string; from?: string }>;
}) {
  const { id } = await params;
  const { notice, from } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const { supabase, user } = await requireUser();
  const c = await selectCharacter<CharacterRow>(
    supabase,
    id,
    "id, name, always_keep, height, weight, lore, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
  );
  if (!c) notFound();

  // Profile builds cost credits on the platform's key (free with their own key on Pro).
  const buildCredits = (await hasOwnAiKey(supabase, user.id)) ? null : PROFILE_BUILD_CREDITS;
  const urls = await signedUrlMap(supabase, [c.profile_photo_path, c.face_sheet_path, c.body_sheet_path, ...c.reference_paths]);
  const imgs = (paths: (string | null)[]) => paths.filter((p): p is string => !!p && !!urls[p]).map((p) => ({ path: p, url: urls[p] }));

  // The marketplace panel is for admins only. The listing data is read with the service role, after this admin check.
  const isAdmin = (await entitlements.planOf(user.id)) === "admin";
  const listing = isAdmin ? await loadEditorListing(c.id) : null;
  const ownImages: OwnImage[] = [
    { which: "profile_photo", label: "Profile photo", path: c.profile_photo_path },
    { which: "face_sheet", label: "Face sheet", path: c.face_sheet_path },
    { which: "body_sheet", label: "Body sheet", path: c.body_sheet_path },
    ...c.reference_paths.slice(0, 3).map((path, i) => ({ which: `reference:${i}`, label: `Reference ${i + 1}`, path })),
  ].flatMap((x) => (x.path && urls[x.path] ? [{ which: x.which, label: x.label, url: urls[x.path] }] : []));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Edit {c.name}</h1>
        <form action={deleteCharacter.bind(null, c.id)}>
          <Button type="submit" variant="destructive" size="sm">Delete</Button>
        </form>
      </div>

      {banner && (
        <p role="status" className={`mb-6 max-w-2xl rounded-md border p-3 text-sm ${banner.good ? "border-emerald-800 text-emerald-300" : "border-amber-700 text-amber-300"}`}>
          {banner.text}
        </p>
      )}

      {isAdmin && (
        <div className="mb-8">
          <ListingEditor
            characterId={c.id}
            characterName={c.name}
            listing={listing}
            hasAssets={!!c.face_sheet_path || !!c.body_sheet_path || c.reference_paths.length > 0}
            ownImages={ownImages}
            profile={(c.profile ?? {}) as CharacterProfile}
          />
        </div>
      )}

      {/* Wide screens: her images on the left, staying in view, and the details and profile on the right. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start xl:gap-10">
        <section className="grid gap-3 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
          <h2 className="text-lg font-semibold">Images</h2>
          <p className="text-sm text-neutral-400 max-sm:hidden">
            Click a picture to see it full size. Photo metadata (location, device) is stripped on upload.
          </p>
          <p className="text-sm text-neutral-400">
            No sheets yet? <Link href={`/reference-sheet?character=${c.id}`} className="underline">Make them from photos</Link>: a face sheet from one face photo, then a face and body sheet.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <ImageSlot label="Profile photo" slot="profile_photo" characterId={c.id} images={imgs([c.profile_photo_path])} hint="For display only, never sent to an AI model." />
            <ImageSlot label="Face sheet" slot="face_sheet" characterId={c.id} images={imgs([c.face_sheet_path])} hint="A sheet of the face from several angles, or one clear face photo." />
            <ImageSlot label="Body sheet" slot="body_sheet" characterId={c.id} images={imgs([c.body_sheet_path])} hint="Front, back and side of the body." />
            <ImageSlot label="Reference images (up to 3)" slot="reference" characterId={c.id} images={imgs(c.reference_paths)} max={3} />
          </div>
        </section>

        <CharacterForm
          action={updateCharacter.bind(null, c.id)}
          initial={{ ...c, profile: c.profile as CharacterProfile }}
          submitLabel="Save character"
          characterId={c.id}
          canBuildProfile={referenceList(c).length > 0}
          buildCredits={buildCredits}
          buildsTotal={FREE_LIMITS.profile_builds}
          fromWizard={from === "wizard"}
        />
      </div>
    </div>
  );
}
