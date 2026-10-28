"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { HistoryImages } from "@/components/history-images";
import { GenerateImage } from "@/components/generate-image";
import { checkImageGeneration } from "@/app/(app)/generate/actions";
import { deleteAllHistory, deleteHistoryEntry, getFreeImagesLeft, getGenerations, getHistory } from "@/app/(app)/history/actions";
import { filterHistory, historyCharacters } from "@/lib/history-filter";
import { OPEN_HISTORY_EVENT, viewImage, type HistoryTab } from "@/lib/panel-events";
import { historyGenerationKind, type GenerationItem, type HistoryItem } from "@/lib/history-types";
import { metaForRun, readEditTarget, type InjectMeta } from "@/lib/inject-meta";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const TABS: { id: HistoryTab; label: string }[] = [
  { id: "prompts", label: "Prompts" },
  { id: "images", label: "Images" },
];
const POLL_MS = 4000;
const MAX_POLLS = 75; // about 5 minutes

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Header button plus a panel that slides in from the right, with the prompts you saved and the images you made.
// Loads fresh each time it opens. Anything in the app can open it on a tab with openHistory().
export function HistoryPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>("prompts");
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [images, setImages] = useState<GenerationItem[] | null>(null);
  const [imagesError, setImagesError] = useState(false);
  const [query, setQuery] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Entries with their Generate controls open, and the free images left (loaded the first time one opens; null means Pro).
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [freeLeft, setFreeLeft] = useState<number | null | undefined>(undefined);
  const { toast, show } = useToast(2500);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = (e as CustomEvent<{ tab?: HistoryTab }>).detail?.tab;
      setTab(wanted === "images" ? "images" : "prompts");
      setOpen(true);
    };
    window.addEventListener(OPEN_HISTORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HISTORY_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setError(false);
    getHistory().then(
      (list) => current && setItems(list),
      () => current && setError(true),
    );
    panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      current = false;
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Images load when you look at them, and again each time you come back to the tab. Loading also finishes any job that completed while you were away.
  useEffect(() => {
    if (!open || tab !== "images") return;
    let current = true;
    setImagesError(false);
    getGenerations().then(
      (list) => current && setImages(list),
      () => current && setImagesError(true),
    );
    return () => {
      current = false;
    };
  }, [open, tab]);

  // While an image is still being made, keep checking it, and reload the list when one finishes or fails.
  const generatingKey = (images ?? []).filter((i) => i.state === "generating").map((i) => i.id).join(",");
  useEffect(() => {
    if (!open || tab !== "images" || !generatingKey) return;
    let stopped = false;
    let ticks = 0;
    const timer = setInterval(async () => {
      if (stopped) return;
      if (++ticks > MAX_POLLS) return clearInterval(timer);
      const results = await Promise.all(generatingKey.split(",").map((id) => checkImageGeneration(id)));
      if (stopped || !results.some((r) => r.ok && (r.state === "complete" || r.state === "failed"))) return;
      const fresh = await getGenerations().catch(() => null);
      if (!stopped && fresh) setImages(fresh);
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [open, tab, generatingKey]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab" || !panel.current) return;
    // Keep Tab inside the open panel.
    const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const shown = useMemo(() => filterHistory(items ?? [], query, characterId), [items, query, characterId]);
  const characters = useMemo(() => historyCharacters(items ?? []), [items]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function toggleGenerate(id: string) {
    setGenerating((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    if (freeLeft === undefined) getFreeImagesLeft().then(setFreeLeft, () => setFreeLeft(null));
  }

  async function remove(id: string) {
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    await deleteHistoryEntry(id);
  }

  async function removeAll() {
    if (!window.confirm("Delete all history? This can't be undone.")) return;
    setBusy(true);
    await deleteAllHistory();
    setItems([]);
    setBusy(false);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    show("Copied");
  }

  // Left and right arrows move between the tabs.
  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    panel.current?.querySelector<HTMLElement>(`#history-tab-${next}`)?.focus();
  }

  const readyImages = (images ?? []).filter((i) => i.state === "ready").length;
  const subtitle =
    tab === "prompts"
      ? items ? `${items.length} saved` : "Loading..."
      : images ? `${readyImages} ready to download` : "Loading...";


  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setTab("prompts");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="text-sm text-neutral-400 hover:text-neutral-100"
      >
        History
      </button>

      {/* Drawn on the page body, not inside the header: the header's blur makes it the anchor for anything fixed within it,
          which squashed the panel into the header strip and let the page show through. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
            <div className="absolute inset-0 bg-black/60" onClick={close} aria-hidden="true" />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-title"
              className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2 p-4 pb-3">
                <div>
                  <h2 id="history-title" className="font-semibold">History</h2>
                  <p className="text-xs text-neutral-500">{subtitle}</p>
                </div>
                <div className="flex gap-1">
                  {tab === "prompts" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!items?.length}
                        onClick={() =>
                          download("model-spawn-history.json", JSON.stringify((items ?? []).map(({ thumbnail: _t, ...rest }) => rest), null, 2), "application/json")
                        }
                      >
                        Export
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={!items?.length || busy} onClick={removeAll}>
                        Delete all
                      </Button>
                    </>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={close} aria-label="Close history">
                    ✕
                  </Button>
                </div>
              </div>

              <div role="tablist" aria-label="History" onKeyDown={onTabKeyDown} className="flex gap-1 border-b border-neutral-800 px-4">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    id={`history-tab-${t.id}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls="history-tabpanel"
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                      tab === t.id ? "border-neutral-100 font-medium text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "prompts" && (
                <div className="flex gap-2 border-b border-neutral-800 p-3">
                  <Input placeholder="Search prompts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search history" />
                  <select
                    value={characterId}
                    onChange={(e) => setCharacterId(e.target.value)}
                    aria-label="Filter by character"
                    className="h-9 max-w-[9rem] rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm"
                  >
                    <option value="">All characters</option>
                    {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div id="history-tabpanel" role="tabpanel" aria-labelledby={`history-tab-${tab}`} className="flex-1 overflow-y-auto p-3">
                {tab === "images" ? (
                  <HistoryImages images={images} error={imagesError} onCopy={copy} onNavigate={() => setOpen(false)} />
                ) : (
                  <>
                    {error && <p role="alert" className="text-sm text-red-400">Couldn&apos;t load your history. Close and reopen to try again.</p>}
                    {!error && items === null && <p className="text-sm text-neutral-400">Loading...</p>}
                    {items && !shown.length && (
                      <p className="text-sm text-neutral-400">{items.length ? "Nothing matches." : "Nothing saved yet. Prompts you write will show up here."}</p>
                    )}
                    <ul className="flex flex-col gap-3">
                      {shown.map((i) => {
                        const isOpen = expanded.has(i.id);
                        const genKind = historyGenerationKind(i.kind);
                        // Inject prompts written by the identity engine carry meta; the server frames them for the image model.
                        const framed = genKind === "inject" && !!i.characterId && Object.keys(i.meta ?? {}).length > 0;
                        const canGenerate = !!genKind && (!!i.imagePath || framed);
                        const showGenerate = canGenerate && generating.has(i.id);
                        return (
                          <li key={i.id} className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                            {i.thumbnail && (
                              <button
                                type="button"
                                onClick={() => viewImage({ url: i.thumbnail as string, prompt: i.prompt, title: i.label })}
                                aria-label={`View the photo for ${i.label}`}
                                className="shrink-0 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={i.thumbnail} alt="" className="h-14 w-14 cursor-zoom-in rounded-md object-cover" />
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{i.label}</p>
                              <p className="text-xs text-neutral-500">{i.characterName} · {when(i.createdAt)}</p>
                              <p className={`mt-1 whitespace-pre-wrap text-sm text-neutral-300 ${isOpen ? "" : "line-clamp-2"}`}>{i.prompt}</p>
                              <div className="mt-1 flex gap-1">
                                <Button type="button" size="sm" variant="ghost" onClick={() => copy(i.prompt)}>Copy</Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => toggle(i.id)}>{isOpen ? "Collapse" : "Expand"}</Button>
                                {canGenerate && (
                                  <Button type="button" size="sm" variant="ghost" aria-expanded={showGenerate} onClick={() => toggleGenerate(i.id)}>
                                    {showGenerate ? "Hide" : "Generate"}
                                  </Button>
                                )}
                                <Button type="button" size="sm" variant="ghost" onClick={() => remove(i.id)}>Delete</Button>
                              </div>
                              {showGenerate && (
                                <div className="mt-2">
                                  {freeLeft === undefined ? (
                                    <p className="text-xs text-neutral-500">Loading...</p>
                                  ) : (
                                    <GenerateImage
                                      prompt={i.prompt}
                                      characterId={i.characterId}
                                      extraPaths={framed ? [] : [i.imagePath as string, ...i.extraPaths]}
                                      kind={genKind}
                                      freeImagesLeft={freeLeft}
                                      meta={framed ? metaForRun(i.meta as InjectMeta, i.imagePath, readEditTarget()) : undefined}
                                    />
                                  )}
                                  <p className="mt-2 text-xs text-neutral-500">
                                    {framed
                                      ? readEditTarget() && i.imagePath
                                        ? `Edits the photo this prompt was written for, swapping in ${i.characterName} from her current references.`
                                        : `Uses ${i.characterName}'s current references and the written prompt ("Edit the target photo" is off on the Inject page).`
                                      : `Uses ${i.characterId ? `${i.characterName}'s current reference images, then ` : ""}the photo this prompt was written for${i.extraPaths.length ? ` and its ${i.extraPaths.length} extra image${i.extraPaths.length === 1 ? "" : "s"}` : ""}.`}
                                  </p>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>
            {toast}
          </div>,
          document.body,
        )}
    </>
  );
}
