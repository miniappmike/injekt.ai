import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CharacterCard } from "@/components/character-card";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS, limitMessage } from "@/lib/limits";
import type { CharacterProfile } from "@/lib/characters";

export default async function CharactersPage() {
  const { supabase, user } = await requireUser();
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .order("created_at", { ascending: false });

  const atLimit = !(await entitlements.isUnlimited(user.id)) && (characters?.length ?? 0) >= FREE_LIMITS.characters;
  // Up to three thumbnails per card: the reference photos first, then the sheets.
  const thumbs = (c: { reference_paths: string[]; face_sheet_path: string | null; body_sheet_path: string | null }) =>
    [...c.reference_paths, c.face_sheet_path, c.body_sheet_path].filter((p): p is string => !!p).slice(0, 3);
  const urls = await signedUrlMap(supabase, (characters ?? []).flatMap((c) => [c.profile_photo_path, ...thumbs(c)]));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">Characters</h1>
        {atLimit ? (
          <Button disabled>New character</Button>
        ) : (
          <Button asChild><Link href="/characters/new">New character</Link></Button>
        )}
      </div>
      {atLimit && <p className="mb-4 text-sm text-neutral-400">{limitMessage("characters")}</p>}
      {!characters?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-700 px-6 py-16 text-center">
          <p className="text-neutral-400">No characters yet. Create your first one.</p>
        </div>
      ) : (
        <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              c={{
                id: c.id,
                name: c.name,
                identityLine: (c.profile as CharacterProfile).identity_line ?? null,
                photo: c.profile_photo_path ? (urls[c.profile_photo_path] ?? null) : null,
                thumbs: thumbs(c).map((p) => urls[p]).filter((u): u is string => !!u),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
