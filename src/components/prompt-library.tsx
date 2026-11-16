"use client";

import { useEffect, useMemo, useState } from "react";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { LockedGenerate } from "@/components/copy-open";
import { LocalTime } from "@/components/local-time";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAllHistory, deleteHistoryEntry, getHistory, getPromptPreviews } from "@/app/(app)/history/actions";
import { filterHistory, historyCharacters } from "@/lib/history-filter";
import { historyGenerationKind, type HistoryItem } from "@/lib/history-types";
import { metaForRun, readEditTarget, type InjectMeta } from "@/lib/inject-meta";
import { viewImage } from "@/lib/panel-events";
import { cn } from "@/lib/utils";

/** Prompts per page. */
const PAGE_SIZE = 10;
type Preview = { url: string; downloadUrl: string; prompt: string | null };

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The Library's Prompts tab: every prompt you've saved, 10 to a page. Each one starts collapsed, showing a preview of
 * the image that goes with it (the image it made, or else the photo it was written for); open one for the full prompt
 * and its actions.
 */
export function PromptLibrary() {
  const generation = useGeneration();
  const { toast, show } = useToast(2500);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getHistory().then(setItems, () => setError(true));
  }, []);

  const shown = useMemo(() => filterHistory(items ?? [], query, characterId), [items, query, characterId]);
  const characters = useMemo(() => historyCharacters(items ?? []), [items]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages);
  const visible = shown.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);

  // Fresh links to the generated images for the prompts on this page.
  const wanted = visible.map((i) => i.generationId).filter((x): x is string => !!x && !previews[x]);
  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (!wantedKey) return;
    let live = true;
    void getPromptPreviews(wantedKey.split(",")).then((got) => live && setPreviews((p) => ({ ...p, ...got }))).catch(() => {});
    return () => {
      live = false;
    };
  }, [wantedKey]);

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  async function remove(id: string) {
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    await deleteHistoryEntry(id);
  }
  async function removeAll() {
    if (!window.confirm("Delete all prompts? This can't be undone.")) return;
    setBusy(true);
    await deleteAllHistory();
    setItems([]);
    setBusy(false);
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    show("Copied");
  }

  if (error) return <p role="alert" className="mt-6 text-sm text-red-400">Couldn&apos;t load your prompts. Reload the page to try again.</p>;
  if (!items) return <p role="status" className="mt-6 text-sm text-neutral-400">Loading…</p>;

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <Input className="min-w-0 flex-1 basis-48" placeholder="Search prompts" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} aria-label="Search prompts" />
        <select
          value={characterId}
          onChange={(e) => { setCharacterId(e.target.value); setPage(1); }}
          aria-label="Filter by character"
          className="h-10 max-w-[10rem] rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-2 text-sm"
        >
          <option value="">All characters</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button type="button" size="sm" variant="ghost" disabled={!items.length} onClick={() => download("model-spawn-history.json", JSON.stringify(items.map(({ thumbnail: _t, ...rest }) => rest), null, 2), "application/json")}>Export</Button>
        <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" disabled={!items.length || busy} onClick={() => void removeAll()}>Delete all</Button>
      </div>

      {!visible.length && <p className="panel p-6 text-center text-sm text-neutral-400">{items.length ? "Nothing matches." : "Nothing saved yet. Prompts you write will show up here."}</p>}

      <ul className="flex flex-col gap-3">
        {visible.map((i) => {
          const isOpen = expanded.has(i.id);
          const genKind = historyGenerationKind(i.kind);
          // Inject prompts written by the identity engine carry meta; the server frames them for the image model.
          const framed = genKind === "inject" && !!i.characterId && Object.keys(i.meta ?? {}).length > 0;
          // Carousel slides saved with their placeholders are framed again by the server.
          const slide = genKind === "carousel" && typeof i.meta?.slidePrompt === "string" && typeof i.meta?.person === "string" ? (i.meta as { slidePrompt: string; person: "full" | "partial" | "none" }) : null;
          const canGenerate = generation && !!genKind && (!!i.imagePath || framed);
          const showGenerate = canGenerate && generating.has(i.id);
          const made = i.generationId ? previews[i.generationId] : undefined;
          const picture = made?.url ?? i.thumbnail;
          return (
            <li key={i.id} className="panel flex gap-3 p-3 transition-colors hover:border-neutral-700 sm:gap-4 sm:p-4">
              {picture ? (
                <button
                  type="button"
                  onClick={() => viewImage(made ? { url: made.url, downloadUrl: made.downloadUrl, prompt: i.prompt, title: i.label, generated: true, generationId: i.generationId } : { url: picture, prompt: i.prompt, title: i.label })}
                  aria-label={`View the image for ${i.label}`}
                  className="shrink-0 self-start overflow-hidden rounded-xl ring-1 ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picture} alt="" className="h-24 w-[4.5rem] cursor-zoom-in bg-neutral-900 object-cover object-top sm:h-28 sm:w-20" />
                </button>
              ) : (
                <div aria-hidden="true" className="h-24 w-[4.5rem] shrink-0 self-start rounded-xl bg-neutral-900 ring-1 ring-white/10 sm:h-28 sm:w-20" />
              )}
              <div className="min-w-0 flex-1">
                <button type="button" aria-expanded={isOpen} onClick={() => setExpanded((s) => flip(s, i.id))} className="block w-full text-left">
                  <span className="block text-sm font-semibold text-neutral-50">{i.label}</span>
                  <span className="block text-xs text-neutral-500">{i.characterName} · <LocalTime iso={i.createdAt} o={{ dateStyle: "medium", timeStyle: "short" }} /></span>
                  <span className={cn("mt-1 block whitespace-pre-wrap text-sm text-neutral-300", isOpen ? "" : "line-clamp-2")}>{i.prompt}</span>
                </button>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded((s) => flip(s, i.id))}>{isOpen ? "Collapse" : "Expand"}</Button>
                  {isOpen && (
                    <>
                      <Button type="button" size="sm" variant="ghost" className="text-brand-300 hover:text-brand-200" onClick={() => void copy(i.prompt)}>Copy prompt</Button>
                      {canGenerate ? (
                        <Button type="button" size="sm" variant="ghost" aria-expanded={showGenerate} onClick={() => setGenerating((s) => flip(s, i.id))}>{showGenerate ? "Hide" : "Generate"}</Button>
                      ) : (
                        !generation && <LockedGenerate label="Generate" />
                      )}
                      <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => void remove(i.id)}>Delete</Button>
                    </>
                  )}
                </div>
                {showGenerate && (
                  <div className="mt-2">
                    <GenerateImage
                      prompt={slide ? slide.slidePrompt : i.prompt}
                      characterId={i.characterId}
                      extraPaths={framed ? [] : [i.imagePath as string, ...i.extraPaths]}
                      kind={genKind}
                      meta={framed ? metaForRun(i.meta as InjectMeta, i.imagePath, readEditTarget()) : slide ? { person: slide.person } : undefined}
                      checkLikeness={!slide || slide.person === "full"}
                      historyId={i.id}
                    />
                    <p className="mt-2 text-xs text-neutral-500">
                      {framed
                        ? readEditTarget() && i.imagePath
                          ? `Edits the photo this prompt was written for, swapping in ${i.characterName} from her current references.`
                          : `Uses ${i.characterName}'s current references and the written prompt (Inject is set to Recreate).`
                        : `Uses ${i.characterId ? `${i.characterName}'s current reference images, then ` : ""}the photo this prompt was written for${i.extraPaths.length ? ` and its ${i.extraPaths.length} extra image${i.extraPaths.length === 1 ? "" : "s"}` : ""}.`}
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          <Button type="button" size="sm" variant="secondary" disabled={at <= 1} onClick={() => { setPage(at - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Previous</Button>
          <span className="text-sm tabular-nums text-neutral-400">Page {at} of {pages}</span>
          <Button type="button" size="sm" variant="secondary" disabled={at >= pages} onClick={() => { setPage(at + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Next</Button>
        </nav>
      )}
      {toast}
    </div>
  );
}
