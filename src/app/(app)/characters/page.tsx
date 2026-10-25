import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Characters</h1>
        {atLimit ? (
          <Button disabled>New character</Button>
        ) : (
          <Button asChild><Link href="/characters/new">New character</Link></Button>
        )}
      </div>
      {atLimit && <p className="mb-4 text-sm text-neutral-400">{limitMessage("characters")}</p>}
      {!characters?.length ? (
        <p className="text-neutral-400">No characters yet. Create your first one.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <div className="grid grid-cols-3 gap-1.5 p-3 pb-0">
                {thumbs(c).filter((p) => urls[p]).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={urls[p]} alt="" className="aspect-[3/4] w-full rounded-md bg-neutral-800 object-cover object-top" />
                ))}
                {!thumbs(c).some((p) => urls[p]) && (
                  <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-500">No reference images yet</div>
                )}
              </div>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  {c.profile_photo_path && urls[c.profile_photo_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[c.profile_photo_path]} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-semibold">{c.name.charAt(0)}</span>
                  )}
                  <CardTitle>{c.name}</CardTitle>
                </div>
                <CardDescription className="line-clamp-3">
                  {(c.profile as CharacterProfile).identity_line ?? "No identity line yet"}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex justify-end">
                <Button asChild size="sm" variant="secondary"><Link href={`/characters/${c.id}`}>Edit</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
