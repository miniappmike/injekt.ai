import { InjectTabs } from "@/components/inject-tabs";
import { HowItWorks } from "@/components/how-it-works";
import { requireUser } from "@/lib/auth";
import { referenceList } from "@/lib/character-images";
import { currentPack } from "@/lib/sheet-pack";
import { refOptions } from "@/lib/generation-job";
import { listOutfits } from "@/lib/outfits";
import { characterAvatars } from "@/lib/character-avatars";

// The prompt writer calls a vision model, one call per target image, with up to 4 versions in each.
export const maxDuration = 300;

export default async function InjectPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("characters")
    .select("id, name, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  // Read on its own so the page still works before migration 0010 adds the column.
  const { data: packs } = await supabase.from("characters").select("id, sheet_pack");
  const packOf = new Map((packs ?? []).map((p) => [p.id as string, p.sheet_pack]));
  const photos = await characterAvatars(supabase, data ?? []);
  const characters = (data ?? []).map((c) => {
    const refCount = referenceList(c).length;
    const hasProfile = Object.values((c.profile ?? {}) as Record<string, unknown>).some((v) => typeof v === "string" && v.trim());
    const pack = currentPack({ ...c, sheet_pack: packOf.get(c.id) });
    const options = refOptions({ ...c, sheet_pack: packOf.get(c.id) }, pack).map(({ id, label, on }) => ({ id, label, on }));
    return { id: c.id, name: c.name, refCount, ready: refCount > 0, hasProfile, refOptions: options, photo: photos.get(c.id) ?? null };
  });

  const outfits = await listOutfits(supabase);

  return (
    <div className="max-w-3xl">
      <h1 className="page-title">Inject</h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-neutral-400">
        Put your character into any photo. Add a photo you like, and get a prompt that swaps her in, ready to paste into your image generator.
      </p>
      <HowItWorks />
      <InjectTabs characters={characters} outfits={outfits} />
    </div>
  );
}
