import Link from "next/link";
import { InjectWriter } from "@/components/inject-writer";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";

// The prompt writer calls a vision model, one call per target image.
export const maxDuration = 60;

export default async function InjectPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("characters")
    .select("id, name, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0 }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Inject</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Write a replacement prompt that puts your character into a target photo. Copy it into your image model of choice.
      </p>
      {characters.length === 0 ? (
        <p className="mt-6 text-neutral-400">
          You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
        </p>
      ) : (
        <InjectWriter characters={characters} />
      )}
    </div>
  );
}
