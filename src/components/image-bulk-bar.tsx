"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { deleteGeneration } from "@/app/(app)/history/actions";
import { pinToReferences } from "@/app/(app)/characters/pin-actions";
import { saveImage } from "@/lib/download";
import { generationDeleted, SEND_TO_VARIANTS_KEY } from "@/lib/panel-events";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";
import { cn } from "@/lib/utils";

/** One image that can be ticked: what the bulk actions need to know about it. */
export interface BulkItem {
  id: string;
  url: string;
  downloadUrl?: string | null;
  /** The character it was made for, if any (needed to pin it). */
  characterId?: string | null;
  /** Reference sheets can't be pinned (they have their own Save). */
  kind?: string;
}

/** The set of ticked image ids, with the helpers both screens need. */
export function useSelection(all: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);
  const drop = useCallback((ids: string[]) => setPicked((s) => new Set([...s].filter((x) => !ids.includes(x)))), []);
  return {
    // Only ids still on screen count, so a deleted or paged-away image never lingers in the selection.
    picked: all.filter((id) => picked.has(id)),
    has: (id: string) => picked.has(id),
    toggle,
    drop,
    selectAll: () => setPicked(new Set(all)),
    clear: () => setPicked(new Set()),
  };
}

/** The tick box in an image's top-left corner. */
export function SelectBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-md backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70",
        checked ? "border-brand-400 bg-gradient-to-b from-brand-400 to-brand-600 text-white" : "border-white/70 bg-neutral-950/60 text-transparent hover:border-brand-300",
      )}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
      </svg>
    </button>
  );
}

/**
 * The management bar above a set of images: Select all / Clear, and once something is ticked Download, Pin, Send to
 * Variants (one image only) and Delete. `slots` says how many reference photos each character can still take; Pin is
 * switched off when the ticked images need more room than that.
 */
export function ImageBulkBar({
  items,
  picked,
  onSelectAll,
  onClear,
  onDeleted,
  slots,
  onPinned,
  className,
  floating = false,
}: {
  items: BulkItem[];
  picked: string[];
  onSelectAll: () => void;
  onClear: () => void;
  /** Called with the ids that were deleted, so the screen can drop them. */
  onDeleted: (ids: string[]) => void;
  /** Free reference slots for a character (10 minus what she has); null when unknown. */
  slots: (characterId: string) => number | null;
  /** Called after images were pinned to a character, so her free slots update. */
  onPinned: (characterId: string, count: number) => void;
  className?: string;
  /** Actions float at the bottom of the page (and appear only while something is ticked) instead of sitting in the bar. */
  floating?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean }>();
  // A result message fades after a few seconds.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(undefined), 6000);
    return () => clearTimeout(t);
  }, [note]);
  const chosen = items.filter((i) => picked.includes(i.id));
  const n = chosen.length;

  // Pin: every ticked image needs a character and not be a sheet, and each character needs room for all of hers.
  const pinBlock = (() => {
    if (!n) return null;
    if (chosen.some((i) => !i.characterId)) return "Some of these weren't made for a character, so they can't be pinned.";
    if (chosen.some((i) => i.kind === "reference_sheet")) return "Reference sheets can't be pinned.";
    const per = new Map<string, number>();
    for (const i of chosen) per.set(i.characterId as string, (per.get(i.characterId as string) ?? 0) + 1);
    for (const [id, count] of per) {
      const free = slots(id);
      if (free === null) return "Couldn't check her reference slots.";
      if (count > free) return free === 0 ? `She already has ${MAX_REFERENCE_PHOTOS} reference photos.` : `Only ${free} reference slot${free === 1 ? "" : "s"} free, and ${count} are ticked.`;
    }
    return null;
  })();

  async function download() {
    setBusy("Downloading");
    setNote(undefined);
    for (const [i, x] of chosen.entries()) {
      await saveImage(x.downloadUrl ?? x.url, `modelspawn-image-${i + 1}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    setBusy(null);
  }

  async function remove() {
    if (!window.confirm(`Delete ${n} image${n === 1 ? "" : "s"}? They are removed from storage and can't be brought back.`)) return;
    setBusy("Deleting");
    setNote(undefined);
    const gone: string[] = [];
    for (const x of chosen) {
      const r = await deleteGeneration(x.id);
      if (r.ok) {
        gone.push(x.id);
        generationDeleted(x.id);
      }
    }
    setBusy(null);
    onDeleted(gone);
    if (gone.length < n) setNote({ text: `Deleted ${gone.length} of ${n}. The rest couldn't be removed; try again.`, bad: true });
    else setNote({ text: `Deleted ${gone.length}.` });
    router.refresh();
  }

  async function pin() {
    setBusy("Pinning");
    setNote(undefined);
    let done = 0;
    const problems: string[] = [];
    for (const [i, x] of chosen.entries()) {
      setBusy(`Pinning ${i + 1} of ${n}`);
      const r = await pinToReferences({ generationId: x.id, characterId: x.characterId as string });
      if (r.ok) {
        done++;
        onPinned(x.characterId as string, 1);
      } else problems.push("error" in r ? r.error : "Her reference photos are full.");
    }
    setBusy(null);
    setNote(problems.length ? { text: `Pinned ${done} of ${n}. ${problems[0]}`, bad: true } : { text: `Pinned ${done} to her reference photos.` });
    router.refresh();
  }

  function toVariants() {
    const x = chosen[0];
    try {
      sessionStorage.setItem(SEND_TO_VARIANTS_KEY, JSON.stringify({ generationId: x.id, url: x.downloadUrl ?? x.url }));
    } catch {
      return setNote({ text: "Couldn't open Variants in this window.", bad: true });
    }
    router.push("/variants");
  }

  const allTicked = items.length > 0 && n === items.length;
  const actions = (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => void download()} disabled={!!busy}>Download</Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => void pin()} disabled={!!busy || !!pinBlock} title={pinBlock ?? "Pin these to her reference photos"}>Pin</Button>
      <Button type="button" size="sm" variant="secondary" onClick={toVariants} disabled={!!busy || n !== 1} title={n === 1 ? "Open this image in Variants" : "Variants takes one image: tick just one"}>Variants</Button>
      <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => void remove()} disabled={!!busy}>Delete</Button>
    </>
  );
  const messages = (
    <>
      {n > 0 && pinBlock && <p className="text-xs text-neutral-400">Pin is off: {pinBlock}</p>}
      {note && <p role="status" className={cn("text-xs", note.bad ? "text-red-400" : "text-emerald-400")}>{note.text}</p>}
    </>
  );

  if (floating) {
    return (
      <>
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
          <Button type="button" size="sm" variant="ghost" onClick={allTicked ? onClear : onSelectAll} disabled={!items.length || !!busy}>
            {allTicked ? "Clear" : "Select all"}
          </Button>
          <span className="text-xs text-neutral-500">Tick images to download, pin or delete them.</span>
        </div>
        {mounted &&
          (n > 0 || note) &&
          createPortal(
            // Drawn on the page body so it floats over the page whatever scrolls; above the phone dock and the image tray.
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tray-h,0px)+var(--dock-clear)+0.75rem)] z-30 flex justify-center px-3 sm:bottom-[calc(var(--tray-h,0px)+1.5rem)]">
              <div className="pointer-events-auto flex max-w-full animate-pop-in flex-col items-center gap-1 rounded-2xl border border-neutral-700/80 bg-neutral-900/95 px-3 py-2 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.95)] backdrop-blur-xl">
                {n > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="px-1 text-sm font-semibold text-neutral-100" aria-live="polite">{busy ?? `${n} selected`}</span>
                    {actions}
                    <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={!!busy} aria-label="Clear selection">✕</Button>
                  </div>
                )}
                {messages}
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={allTicked ? onClear : onSelectAll} disabled={!items.length || !!busy}>
          {allTicked ? "Clear" : "Select all"}
        </Button>
        {n > 0 ? (
          <>
            <span className="text-sm font-semibold text-neutral-100" aria-live="polite">{busy ?? `${n} selected`}</span>
            <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={!!busy}>Clear</Button>
            <span className="mx-1 h-5 w-px bg-neutral-800 max-sm:hidden" aria-hidden="true" />
            {actions}
          </>
        ) : (
          <span className="text-xs text-neutral-500">Tick images to download, pin or delete them.</span>
        )}
      </div>
      {messages}
    </div>
  );
}
