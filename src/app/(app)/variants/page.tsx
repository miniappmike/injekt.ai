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
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0, hasSheet: !!(c.face_sheet_path || c.body_sheet_path) }));

  return (
    <div className="max-w-3xl">
      <h1 className="page-title">Variants</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-400">
        Turn one generated image into a set of edit prompts, plan a whole carousel from a cover, or write finished variation prompts to paste into another generator.
      </p>
      {isPro ? (
        <VariantsTool characters={characters} />
      ) : (
        <p className="mt-6 rounded-md border border-neutral-800 p-4 text-neutral-300">{limitMessage("variants")}</p>
      )}
    </div>
  );
}
