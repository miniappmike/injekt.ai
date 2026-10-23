import { HistoryList, type HistoryItem } from "@/components/history-list";
import { requireUser } from "@/lib/auth";
import { HISTORY_LIMIT } from "@/lib/history";
import { signedUrlMap } from "@/lib/media-urls";

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const [{ data: rows }, { data: characters }] = await Promise.all([
    supabase
      .from("prompt_history")
      .select("id, character_id, kind, label, prompt, image_path, created_at")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("characters").select("id, name"),
  ]);
  const names = new Map((characters ?? []).map((c) => [c.id, c.name]));
  const urls = await signedUrlMap(supabase, (rows ?? []).map((r) => r.image_path));

  const items: HistoryItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    characterId: r.character_id,
    characterName: r.character_id ? (names.get(r.character_id) ?? "Deleted character") : "No character",
    kind: r.kind,
    label: r.label,
    prompt: r.prompt,
    thumbnail: r.image_path ? (urls[r.image_path] ?? null) : null,
    createdAt: r.created_at,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="mt-1 text-sm text-neutral-400">Your newest {HISTORY_LIMIT} prompts and reports.</p>
      <HistoryList items={items} characters={(characters ?? []).map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
