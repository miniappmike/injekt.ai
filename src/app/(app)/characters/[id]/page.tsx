import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character-form";
import { requireUser } from "@/lib/auth";
import type { CharacterProfile } from "@/lib/characters";
import { deleteCharacter, updateCharacter } from "../actions";

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: c } = await supabase
    .from("characters")
    .select("id, name, always_keep, height, weight, lore, profile")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit {c.name}</h1>
        <form action={deleteCharacter.bind(null, c.id)}>
          <Button type="submit" variant="destructive" size="sm">Delete</Button>
        </form>
      </div>
      <CharacterForm
        action={updateCharacter.bind(null, c.id)}
        initial={{ ...c, profile: c.profile as CharacterProfile }}
        submitLabel="Save character"
      />
    </div>
  );
}
