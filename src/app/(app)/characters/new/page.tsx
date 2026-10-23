import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character-form";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { FREE_LIMITS, limitMessage } from "@/lib/limits";
import { createCharacter } from "../actions";

export default async function NewCharacterPage() {
  const { supabase, user } = await requireUser();
  const { count } = await supabase.from("characters").select("id", { count: "exact", head: true });
  const atLimit = !(await entitlements.isUnlimited(user.id)) && (count ?? 0) >= FREE_LIMITS.characters;

  if (atLimit) {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold">New character</h1>
        <p className="mb-4 text-neutral-400">{limitMessage("characters")}</p>
        <Button asChild variant="outline"><Link href="/characters">Back to characters</Link></Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New character</h1>
      <CharacterForm action={createCharacter} submitLabel="Save character" />
    </div>
  );
}
