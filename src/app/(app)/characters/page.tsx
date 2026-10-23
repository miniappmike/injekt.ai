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
    .select("id, name, profile, profile_photo_path")
    .order("created_at", { ascending: false });

  const atLimit = !(await entitlements.isUnlimited(user.id)) && (characters?.length ?? 0) >= FREE_LIMITS.characters;
  const urls = await signedUrlMap(supabase, (characters ?? []).map((c) => c.profile_photo_path));

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
            <Card key={c.id}>
              {c.profile_photo_path && urls[c.profile_photo_path] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[c.profile_photo_path]} alt="" className="h-40 w-full rounded-t-lg object-cover" />
              )}
              <CardHeader>
                <CardTitle>{c.name}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {(c.profile as CharacterProfile).identity_line ?? "No identity line yet"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Button asChild size="sm" variant="secondary"><Link href={`/characters/${c.id}`}>Edit</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
