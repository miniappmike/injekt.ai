import { CharactersBoard } from "@/components/group-photo";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS, limitMessage } from "@/lib/limits";
import { adminClient } from "@/lib/supabase/admin";
import type { CharacterProfile } from "@/lib/characters";

export const metadata = { title: "Characters" };

export default async function CharactersPage() {
  const { supabase, user } = await requireUser();
  const cols = "id, name, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths, created_at, updated_at";
  let { data: allCharacters, error } = await supabase
    .from("characters")
    .select(`${cols}, sort_order`)
    .order("created_at", { ascending: false });
  // Until migration 0034 is run there is no sort_order column: load without it (custom order then follows newest first).
  if (error) {
    const plain = await supabase.from("characters").select(cols).order("created_at", { ascending: false });
    allCharacters = (plain.data ?? []).map((c) => ({ ...c, sort_order: null }));
  }

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
  const urls = await signedUrlMap(supabase, (characters ?? []).flatMap((c) => [c.profile_photo_path, c.reference_paths[0], ...thumbs(c), ...labelled(c).map((x) => x.path)]));

  return (
    <CharactersBoard
      canList={isAdmin}
      atLimit={atLimit}
      limitText={limitMessage("characters")}
      characters={(characters ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        identityLine: (c.profile as CharacterProfile).identity_line ?? null,
        // The small circle: her profile photo (the big picture is her cover, thumbs[0], the first reference photo).
        // Falls back to the cover only when she has no profile photo.
        photo: (c.profile_photo_path ?? c.reference_paths[0]) ? (urls[(c.profile_photo_path ?? c.reference_paths[0]) as string] ?? null) : null,
        thumbs: thumbs(c).map((p) => urls[p]).filter((u): u is string => !!u),
        refCount: c.reference_paths.length,
        hasSheet: !!(c.face_sheet_path || c.body_sheet_path),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        sortOrder: c.sort_order ?? null,
        images: labelled(c).flatMap((x) => (urls[x.path] ? [{ label: x.label, url: urls[x.path] }] : [])),
      }))}
    />
  );
}
