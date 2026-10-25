import { InjectTabs } from "@/components/inject-tabs";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { referenceList } from "@/lib/character-images";

// The prompt writer calls a vision model, one call per target image.
export const maxDuration = 60;

export default async function InjectPage() {
  const { supabase, user } = await requireUser();
  const [isPro, remaining] = await Promise.all([entitlements.isUnlimited(user.id), entitlements.remaining(user.id)]);
  const { data } = await supabase
    .from("characters")
    .select("id, name, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const characters = (data ?? []).map((c) => {
    const refCount = referenceList(c).length;
    return { id: c.id, name: c.name, refCount, ready: refCount > 0 };
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
