import Link from "next/link";
import { LikenessChecker } from "@/components/likeness-checker";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { limitMessage } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";
import { revisedRun, REFERENCES_RUN, type RevisedRun } from "@/lib/revised-run";

// Calls a vision model with several images.
export const maxDuration = 60;

/**
 * The prompt the person wrote for an image: its History prompt when it was made from one, or their own Edit prompt.
 * Other images were sent with a prompt the server framed, which isn't one they could revise and run again, so none.
 */
async function promptFor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  g: { kind: string; prompt: string | null; params: { history_id?: string } | null },
): Promise<{ prompt: string; run: RevisedRun }> {
  const historyId = g.params?.history_id;
  if (historyId) {
    // "*" so this works before migration 0009 (extra images) and 0010 (meta).
    const { data: h } = await supabase.from("prompt_history").select("*").eq("id", historyId).maybeSingle();
    if (h?.prompt)
      return {
        prompt: String(h.prompt).slice(0, 6000),
        run: revisedRun({ kind: h.kind, meta: h.meta ?? null, imagePath: h.image_path ?? null, extraPaths: h.extra_image_paths ?? [] }),
      };
  }
  // An Edit is sent as their prompt with the makeup rule added; leave the rule off.
  return { prompt: g.kind === "edit" && g.prompt ? g.prompt.split(" MAKEUP STAYS:")[0].slice(0, 6000) : "", run: REFERENCES_RUN };
}

export default async function LikenessPage({ searchParams }: { searchParams: Promise<{ character?: string; generation?: string }> }) {
  const { supabase, user } = await requireUser();
  const isPro = await entitlements.isUnlimited(user.id);
  const params = await searchParams;
  const { data } = await supabase
    .from("characters")
    .select("id, name, face_sheet_path, body_sheet_path, reference_paths")
    .order("name");
  const characters = (data ?? []).map((c) => ({ id: c.id, name: c.name, ready: referenceList(c).length > 0 }));

  // "See likeness" on a generated image opens it here, ready to check, with the prompt it was made from.
  let generated: { id: string; url: string; prompt: string; run: RevisedRun } | null = null;
  if (params.generation && /^[0-9a-f-]{36}$/i.test(params.generation)) {
    const { data: g } = await supabase.from("generations").select("id, kind, prompt, params, output_path, status").eq("id", params.generation).maybeSingle();
    if (g?.output_path && g.status === "complete") {
      const [{ data: s }, prompt] = await Promise.all([
        supabase.storage.from("generations").createSignedUrl(g.output_path as string, 3600),
        promptFor(supabase, g),
      ]);
      if (s) generated = { id: g.id as string, url: s.signedUrl, ...prompt };
    }
  }
  const initialCharacter = characters.some((c) => c.id === params.character) ? params.character : undefined;

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
        <LikenessChecker characters={characters} initialCharacterId={initialCharacter} generated={generated} />
      )}
    </div>
  );
}
