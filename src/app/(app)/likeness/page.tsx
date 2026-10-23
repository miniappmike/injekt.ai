import Link from "next/link";
import { LikenessChecker } from "@/components/likeness-checker";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { limitMessage } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";

// Calls a vision model with several images.
export const maxDuration = 60;

export default async function LikenessPage() {
  const { supabase, user } = await requireUser();
  const isPro = await entitlements.isUnlimited(user.id);
  const { data } = await supabase
    .from("characters")
    .select("id, name, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0 }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Likeness</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Check a generated image against your character&apos;s references, trait by trait, and get fixes to paste into your next prompt.
      </p>
      {!isPro ? (
        <p className="mt-6 rounded-md border border-neutral-800 p-4 text-neutral-300">{limitMessage("likeness")}</p>
      ) : characters.length === 0 ? (
        <p className="mt-6 text-neutral-400">
          You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
        </p>
      ) : (
        <LikenessChecker characters={characters} />
      )}
    </div>
  );
}
