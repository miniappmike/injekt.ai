"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { deleteAllHistory, deleteHistoryEntry, getHistory } from "@/app/(app)/history/actions";
import { filterHistory, historyCharacters } from "@/lib/history-filter";
import type { HistoryItem } from "@/lib/history-types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Header button plus a panel that slides in from the right. Loads the history fresh each time it opens.
export function HistoryPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast(2500);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(false);
    getHistory().then(setItems, () => setError(true));
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="text-sm text-neutral-400 hover:text-neutral-100"
      >
        History
      </button>

      {open && (
        <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
          <div className="absolute inset-0 bg-black/60" onClick={close} aria-hidden="true" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-neutral-800 p-4">
              <div>
                <h2 id="history-title" className="font-semibold">History</h2>
                <p className="text-xs text-neutral-500">{items ? `${items.length} saved` : "Loading..."}</p>
              </div>
              <div className="flex gap-1">
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
                <Button type="button" size="sm" variant="ghost" onClick={close} aria-label="Close history">
                  ✕
                </Button>
              </div>
            </div>

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

            <div className="flex-1 overflow-y-auto p-3">
              {error && <p role="alert" className="text-sm text-red-400">Couldn&apos;t load your history. Close and reopen to try again.</p>}
              {!error && items === null && <p className="text-sm text-neutral-400">Loading...</p>}
              {items && !shown.length && (
                <p className="text-sm text-neutral-400">{items.length ? "Nothing matches." : "Nothing saved yet. Prompts you write will show up here."}</p>
              )}
              <ul className="flex flex-col gap-3">
                {shown.map((i) => {
                  const isOpen = expanded.has(i.id);
                  return (
                    <li key={i.id} className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                      {i.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{i.label}</p>
                        <p className="text-xs text-neutral-500">{i.characterName} · {when(i.createdAt)}</p>
                        <p className={`mt-1 whitespace-pre-wrap text-sm text-neutral-300 ${isOpen ? "" : "line-clamp-2"}`}>{i.prompt}</p>
                        <div className="mt-1 flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await navigator.clipboard.writeText(i.prompt);
                              show("Copied");
                            }}
                          >
                            Copy
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => toggle(i.id)}>{isOpen ? "Collapse" : "Expand"}</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => remove(i.id)}>Delete</Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {toast}
        </div>
      )}
    </>
  );
}
