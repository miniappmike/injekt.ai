import { VariantsTool } from "@/components/variants-tool";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { limitMessage } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";

// Calls a vision model with several images.
export const maxDuration = 60;

export default async function VariantsPage() {
  const { supabase, user } = await requireUser();
  const isPro = await entitlements.isUnlimited(user.id);
  const { data } = await supabase
    .from("characters")
    .select("id, name, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0 }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Variants</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Turn one generated image into a set of edit prompts, or plan a whole carousel from a cover.
      </p>
      {isPro ? (
        <VariantsTool characters={characters} />
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 p-4 text-neutral-300">{limitMessage("variants")}</p>
      )}
    </div>
  );
}
