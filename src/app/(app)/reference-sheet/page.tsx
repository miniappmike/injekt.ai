import { ReferenceSheetMaker } from "@/components/reference-sheet-maker";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { signedUrlMap } from "@/lib/media-urls";

export default async function ReferenceSheetPage({ searchParams }: { searchParams: Promise<{ character?: string }> }) {
  const { character } = await searchParams;
  const { supabase, user } = await requireUser();
  const [isPro, remaining] = await Promise.all([entitlements.isUnlimited(user.id), entitlements.remaining(user.id)]);
  const { data } = await supabase.from("characters").select("id, name, face_sheet_path, body_sheet_path").order("name");
  const rows = data ?? [];
  const urls = await signedUrlMap(supabase, rows.flatMap((c) => [c.face_sheet_path, c.body_sheet_path]));
  const image = (path: string | null) => (path && urls[path] ? { path, url: urls[path] } : null);
  const characters = rows.map((c) => ({ id: c.id, name: c.name, faceSheet: image(c.face_sheet_path), bodySheet: image(c.body_sheet_path) }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Reference Sheet</h1>
      <p className="mt-1 text-sm text-neutral-400">
        A reference sheet shows your character from many angles in one image. Image models use it as the strict identity reference, which keeps the
        face and body the same from one picture to the next.
      </p>
      <ReferenceSheetMaker characters={characters} initialCharacterId={character} freeImagesLeft={isPro ? null : remaining.free_images} />
    </div>
  );
}
