"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronIcon, DuplicateIcon, TrashIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { duplicateCharacter } from "@/app/(app)/characters/duplicate-actions";
import { Button } from "@/components/ui/button";
import { deleteCharacter } from "@/app/(app)/characters/actions";
import { getCharacterGenerations } from "@/app/(app)/characters/media-actions";
import { GENERATION_DELETED_EVENT, viewImage } from "@/lib/panel-events";
import { ImageBulkBar, SelectBox, useSelection } from "@/components/image-bulk-bar";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";
import { shortTimeLeft } from "@/lib/retention";
import { saveImage } from "@/lib/download";
import { Download } from "lucide-react";

export interface CardImage {
  label: string;
  url: string;
  /** Set for generated images, so the viewer can offer Download, Copy prompt, Variants and Pin It. */
  generationId?: string;
  downloadUrl?: string | null;
  prompt?: string | null;
  kind?: string;
}

/** Delete with a confirmation. Deleting also removes her stored images, so it asks first. */
export function DeleteCharacterButton({ id, name, icon = false }: { id: string; name: string; icon?: boolean }) {
  return (
    <form
      className={icon ? "min-w-0 flex-1" : undefined}
      action={deleteCharacter.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${name}? Her images and sheets will be removed too. This can't be undone.`)) e.preventDefault();
      }}
    >
      {icon ? (
        <button type="submit" aria-label={`Delete ${name}`} className="flex h-10 w-full items-center justify-center rounded-xl bg-red-600/90 text-white transition-transform active:scale-90">
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <Button type="submit" size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300">Delete</Button>
      )}
    </form>
  );
}

/** Duplicate (Pro and admin): a second character with the same profile, sheets and reference photos. */
export function DuplicateCharacterButton({ id, name, icon = false }: { id: string; name: string; icon?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();
  const run = () => {
    if (!window.confirm(`Duplicate ${name}? The copy gets the same profile, sheets and reference photos.`)) return;
    setError(null);
    start(async () => {
      const r = await duplicateCharacter(id).catch(() => ({ error: "Couldn't duplicate her. Try again." }) as { error?: string; name?: string });
      if (r.error) return setError(r.error);
      show(`Created ${r.name}`);
      router.refresh();
    });
  };
  return (
    <>
      {icon ? (
        <div className="min-w-0 flex-1">
        <button type="button" onClick={run} disabled={busy} aria-label={`Duplicate ${name}`} className="flex h-10 w-full items-center justify-center rounded-xl bg-neutral-800 text-neutral-100 transition-transform active:scale-90 disabled:opacity-50">
          <DuplicateIcon className={`h-[18px] w-[18px] ${busy ? "animate-pulse" : ""}`} />
        </button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={run} disabled={busy}>{busy ? "Duplicating…" : "Duplicate"}</Button>
      )}
      {(toast || error) &&
        createPortal(
          <>
            {toast}
            {error && (
              <div role="alert" onClick={() => setError(null)} className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 cursor-pointer rounded-full border border-red-500/40 bg-neutral-900/95 px-4 py-2 text-sm font-medium text-red-200 shadow-lg backdrop-blur-xl max-sm:bottom-[calc(var(--dock-clear)+0.75rem)]">
                {error}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}

/**
 * A magnifying glass over her card. It opens a panel with every image generated for her that is still on the server
 * (kept 72 hours), newest first; tapping one opens it full screen, and the arrow keys step through them. Her reference
 * photos are a separate pack (what she has pinned) and live on her own page.
 */
const OPEN_IMAGES_EVENT = "modelspawn:open-character-images";

/** Her picture on the card: opens her images panel (the Edit button is what goes to her page). */
export function CharacterCoverButton({ characterId, name, className, children }: { characterId: string; name: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={`See the images made for ${name}`} className={className} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_IMAGES_EVENT, { detail: characterId }))}>
      {children}
    </button>
  );
}

export function CharacterImagesButton({ name, characterId, refCount = MAX_REFERENCE_PHOTOS }: { name: string; characterId: string; refCount?: number }) {
  const [open, setOpen] = useState(false);
  // Reference photos she has now: starts from the card, goes up as images are pinned from this panel.
  const [pinned, setPinned] = useState(0);
  const [images, setImages] = useState<CardImage[] | null>(null);
  // An image deleted from the viewer leaves this panel too.
  useEffect(() => {
    const on = (e: Event) => setImages((list) => (list ? list.filter((x) => x.generationId !== (e as CustomEvent<string>).detail) : list));
    window.addEventListener(GENERATION_DELETED_EVENT, on);
    return () => window.removeEventListener(GENERATION_DELETED_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setImages(null);
    void getCharacterGenerations(characterId)
      .then((list) => alive && setImages(list.map((g) => ({ label: `${g.label} · ${shortTimeLeft(g.expiresAt)}`, url: g.url, generationId: g.id, downloadUrl: g.downloadUrl, prompt: g.prompt, kind: g.kind }))))
      .catch(() => alive && setImages([]));
    return () => {
      alive = false;
    };
  }, [open, characterId]);
  // Clicking her picture on the card opens this same panel.
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<string>).detail === characterId && setOpen(true);
    window.addEventListener(OPEN_IMAGES_EVENT, on);
    return () => window.removeEventListener(OPEN_IMAGES_EVENT, on);
  }, [characterId]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = before;
      document.documentElement.classList.remove("sheet-open");
    };
  }, [open]);

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${name}'s images`}>
            <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-sm" />
            <div className="panel relative flex max-h-[88dvh] w-full max-w-5xl animate-pop-in flex-col overflow-hidden max-sm:rounded-b-none sm:max-h-[90dvh]">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
                <h2 className="font-display text-lg font-bold text-neutral-50">{name}&apos;s images <span className="text-sm font-medium text-neutral-500">{images?.length ?? ""}</span></h2>
                <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
              </div>
              <div className="min-h-0 flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
                {images === null ? (
                  <p className="py-10 text-center text-sm text-neutral-400" role="status">Loading…</p>
                ) : images.length === 0 ? (
                  <p className="py-10 text-center text-sm text-neutral-400">No images made for {name} in the last 72 hours. Her reference photos are on her page.</p>
                ) : (
                  <ImageStrip name={name} images={images} characterId={characterId} freeSlots={Math.max(0, MAX_REFERENCE_PHOTOS - refCount - pinned)} onPinned={(n) => setPinned((p) => p + n)} />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** The images in one sideways-scrolling row, with arrow buttons on wide screens (phones just swipe). */
function ImageStrip({ name, images, characterId, freeSlots, onPinned }: { name: string; images: CardImage[]; characterId: string; freeSlots: number; onPinned: (n: number) => void }) {
  const ids = images.flatMap((i) => (i.generationId ? [i.generationId] : []));
  const sel = useSelection(ids);
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, images.length]);
  const go = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * Math.max(240, row.current.clientWidth * 0.8), behavior: "smooth" });
  // Left and right arrow keys move through her images in the panel, one card at a time. With the full-screen viewer open
  // it takes the arrows first (and stops them here), stepping through the same images.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      const el = row.current;
      if (!el) return;
      e.preventDefault();
      el.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * ((el.querySelector("li")?.clientWidth ?? 256) + 12), behavior: "smooth" });
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const arrow = "absolute top-[calc(50%-1.25rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-950/85 text-neutral-50 shadow-lg ring-1 ring-white/20 backdrop-blur transition-all hover:scale-105 hover:bg-brand-500 disabled:pointer-events-none disabled:opacity-0 max-sm:hidden";
  return (
    <div>
      <ImageBulkBar
        className="mb-3"
        items={images.flatMap((i) => (i.generationId ? [{ id: i.generationId, url: i.url, downloadUrl: i.downloadUrl, characterId, kind: i.kind }] : []))}
        picked={sel.picked}
        onSelectAll={sel.selectAll}
        onClear={sel.clear}
        onDeleted={sel.drop}
        slots={() => freeSlots}
        onPinned={(_, n) => onPinned(n)}
      />
      <div className="relative">
      <button type="button" aria-label="Scroll left" disabled={edge.start} onClick={() => go(-1)} className={arrow + " -left-3"}>
        <ChevronIcon className="h-5 w-5 rotate-180" />
      </button>
      <button type="button" aria-label="Scroll right" disabled={edge.end} onClick={() => go(1)} className={arrow + " -right-3"}>
        <ChevronIcon className="h-5 w-5" />
      </button>
      <ul ref={row} onScroll={measure} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]" aria-label="Scroll sideways for more">
        {images.map((img) => (
          <li key={img.label + img.url} className="relative w-[62vw] max-w-[18rem] shrink-0 snap-start sm:w-64">
            {img.generationId && <SelectBox checked={sel.has(img.generationId)} onChange={() => sel.toggle(img.generationId as string)} label={`Select ${img.label}`} />}
            <button
              type="button"
              onClick={() => {
                const shot = (x: CardImage) => ({ url: x.url, downloadUrl: x.downloadUrl, prompt: x.prompt, title: `${name}: ${x.label}`, generated: !!x.generationId, generationId: x.generationId });
                viewImage({ ...shot(img), gallery: images.map(shot) });
              }}
              className="group block w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 text-left transition-colors hover:border-brand-500/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.label} loading="lazy" className="aspect-[3/4] w-full bg-neutral-900 object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
              <span className="block px-2.5 py-1.5 text-xs font-medium text-neutral-300">{img.label}</span>
            </button>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}

/**
 * Download her reference sheets (face, then body), one file every 3 seconds. Browsers bundle or block several
 * downloads fired at once, so they are spaced out.
 */
export function DownloadSheetsButton({ name, sheets, icon = false }: { name: string; sheets: { label: string; url: string }[]; icon?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (sheets.length === 0) return null;
  const run = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < sheets.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 3000));
        const s = sheets[i];
        await saveImage(s.url, `${name}-${s.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      }
    } finally {
      setBusy(false);
    }
  };
  return icon ? (
    <div className="min-w-0 flex-1">
    <button type="button" onClick={() => void run()} disabled={busy} aria-label={`Download ${name}'s sheets`} className="flex h-10 w-full items-center justify-center rounded-xl bg-neutral-800 text-neutral-100 transition-transform active:scale-90 disabled:opacity-50">
      <Download className={`h-[18px] w-[18px] ${busy ? "animate-pulse" : ""}`} />
    </button>
    </div>
  ) : (
    <Button type="button" size="sm" variant="ghost" onClick={() => void run()} disabled={busy}>{busy ? "Downloading…" : "Download sheets"}</Button>
  );
}
