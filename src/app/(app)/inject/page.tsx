import { InjectTabs } from "@/components/inject-tabs";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { referenceList } from "@/lib/character-images";
import { currentPack } from "@/lib/sheet-pack";
import { refOptions } from "@/lib/generation-job";

// The prompt writer calls a vision model, one call per target image, with up to 4 versions in each.
export const maxDuration = 300;

export default async function InjectPage() {
  const { supabase, user } = await requireUser();
  const [isPro, remaining] = await Promise.all([entitlements.isUnlimited(user.id), entitlements.remaining(user.id)]);
  const { data } = await supabase
    .from("characters")
    .select("id, name, profile, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  // Read on its own so the page still works before migration 0010 adds the column.
  const { data: packs } = await supabase.from("characters").select("id, sheet_pack");
  const packOf = new Map((packs ?? []).map((p) => [p.id as string, p.sheet_pack]));
  const characters = (data ?? []).map((c) => {
    const refCount = referenceList(c).length;
    const hasProfile = Object.values((c.profile ?? {}) as Record<string, unknown>).some((v) => typeof v === "string" && v.trim());
    const pack = currentPack({ ...c, sheet_pack: packOf.get(c.id) });
    const options = refOptions({ ...c, sheet_pack: packOf.get(c.id) }, pack).map(({ id, label, on }) => ({ id, label, on }));
    return { id: c.id, name: c.name, refCount, ready: refCount > 0, hasProfile, refOptions: options };
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Inject</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Put your character into a photo. Write a prompt tailored to the photo, swap directly, or write your own prompt.
      </p>
      <InjectTabs characters={characters} isPro={isPro} freeImagesLeft={isPro ? null : remaining.free_images} />
    </div>
  );
}
