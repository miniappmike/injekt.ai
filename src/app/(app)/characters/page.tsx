import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CharacterCard } from "@/components/character-card";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS, limitMessage } from "@/lib/limits";
import { adminClient } from "@/lib/supabase/admin";
import type { CharacterProfile } from "@/lib/characters";

export default async function CharactersPage() {
  const { supabase, user } = await requireUser();
  const { data: allCharacters } = await supabase
    .from("characters")
    .select("id, name, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .order("created_at", { ascending: false });

  // The free-plan limit counts every character she has, listed or not.
  const atLimit = !(await entitlements.isUnlimited(user.id)) && (allCharacters?.length ?? 0) >= FREE_LIMITS.characters;
  // An admin's characters that are on the marketplace (live, mid-checkout or sold) live there, not in this grid.
  let characters = allCharacters;
  const isAdmin = (await entitlements.planOf(user.id)) === "admin";
  if (allCharacters?.length && isAdmin) {
    const { data: listed } = await adminClient()
      .from("marketplace_listings")
      .select("source_character_id")
      .in("source_character_id", allCharacters.map((c) => c.id))
      .in("status", ["available", "reserved", "sold"]);
    const hidden = new Set((listed ?? []).map((l) => l.source_character_id));
    characters = allCharacters.filter((c) => !hidden.has(c.id));
  }
  // Up to three thumbnails per card: the reference photos first, then the sheets.
  const thumbs = (c: { reference_paths: string[]; face_sheet_path: string | null; body_sheet_path: string | null }) =>
    [...c.reference_paths, c.face_sheet_path, c.body_sheet_path].filter((p): p is string => !!p).slice(0, 3);
  // Everything she has, labelled, for the magnifier panel on each card.
  const labelled = (c: { profile_photo_path: string | null; face_sheet_path: string | null; body_sheet_path: string | null; reference_paths: string[] }) => [
    { label: "Face sheet", path: c.face_sheet_path },
    { label: "Body sheet", path: c.body_sheet_path },
    { label: "Profile photo", path: c.profile_photo_path },
    ...c.reference_paths.map((path, i) => ({ label: `Reference ${i + 1}`, path })),
  ].filter((x): x is { label: string; path: string } => !!x.path);
  const urls = await signedUrlMap(supabase, (characters ?? []).flatMap((c) => [c.profile_photo_path, ...thumbs(c), ...labelled(c).map((x) => x.path)]));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 max-sm:mb-4">
        <h1 className="page-title">Characters</h1>
        {atLimit ? (
          <Button disabled>New character</Button>
        ) : (
          <Button asChild className="max-sm:w-full"><Link href="/characters/new">New character</Link></Button>
        )}
      </div>
      {atLimit && <p className="mb-4 text-sm text-neutral-400">{limitMessage("characters")}</p>}
      {!characters?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-700 px-6 py-16 text-center">
          <p className="text-neutral-400">No characters yet. Create your first one.</p>
        </div>
      ) : (
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              canList={isAdmin}
              c={{
                id: c.id,
                name: c.name,
                identityLine: (c.profile as CharacterProfile).identity_line ?? null,
                photo: c.profile_photo_path ? (urls[c.profile_photo_path] ?? null) : null,
                thumbs: thumbs(c).map((p) => urls[p]).filter((u): u is string => !!u),
                images: labelled(c).flatMap((x) => (urls[x.path] ? [{ label: x.label, url: urls[x.path] }] : [])),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
