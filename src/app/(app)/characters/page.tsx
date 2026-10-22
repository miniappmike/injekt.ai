import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import type { CharacterProfile } from "@/lib/characters";

export default async function CharactersPage() {
  const { supabase } = await requireUser();
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, profile")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <Button asChild><Link href="/characters/new">New character</Link></Button>
      </div>
      {!characters?.length ? (
        <p className="text-neutral-400">No characters yet. Create your first one.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <Card key={c.id}>
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
