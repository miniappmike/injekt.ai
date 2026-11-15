"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronIcon, EyeIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { deleteCharacter } from "@/app/(app)/characters/actions";
import { getCharacterGenerations } from "@/app/(app)/characters/media-actions";
import { GENERATION_DELETED_EVENT, viewImage } from "@/lib/panel-events";

export interface CardImage {
  label: string;
  url: string;
  /** Set for generated images, so the viewer can offer Download, Copy prompt, Variants and Pin It. */
  generationId?: string;
  downloadUrl?: string | null;
  prompt?: string | null;
}

/** Delete with a confirmation. Deleting also removes her stored images, so it asks first. */
export function DeleteCharacterButton({ id, name, icon = false }: { id: string; name: string; icon?: boolean }) {
  return (
    <form
      action={deleteCharacter.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${name}? Her images and sheets will be removed too. This can't be undone.`)) e.preventDefault();
      }}
    >
      {icon ? (
        <button type="submit" aria-label={`Delete ${name}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600/90 text-white transition-transform active:scale-90">
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <Button type="submit" size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300">Delete</Button>
      )}
    </form>
  );
}

/**
 * A magnifying glass over her card. It opens a panel with every image generated for her that is still on the server
 * (kept 72 hours), newest first; tapping one opens it full screen, and the arrow keys step through them. Her reference
 * photos are a separate pack (what she has pinned) and live on her own page.
 */
export function CharacterImagesButton({ name, characterId }: { name: string; characterId: string }) {
  const [open, setOpen] = useState(false);
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
      .then((list) => alive && setImages(list.map((g) => ({ label: `${g.label} · ${new Date(g.expiresAt).getTime() - Date.now() < 3_600_000 ? "under 1h" : `${Math.max(1, Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 3_600_000))}h`} left`, url: g.url, generationId: g.id, downloadUrl: g.downloadUrl, prompt: g.prompt }))))
      .catch(() => alive && setImages([]));
    return () => {
      alive = false;
    };
  }, [open, characterId]);
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
      <span className="group absolute left-3 top-3 z-10 max-sm:left-2 max-sm:top-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`See the images made for ${name}`}
          aria-describedby={`eye-tip-${characterId}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950/70 text-brand-400 ring-1 ring-brand-500/40 backdrop-blur transition-all hover:scale-105 hover:bg-neutral-950/90 hover:text-brand-300 active:scale-90"
        >
          <EyeIcon className="h-[18px] w-[18px]" />
        </button>
        <span
          role="tooltip"
          id={`eye-tip-${characterId}`}
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-48 rounded-md border border-neutral-700 bg-neutral-900 p-2 text-xs font-normal text-neutral-200 shadow-lg group-focus-within:block group-hover:block"
        >
          View the active images of {name}
        </span>
      </span>
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
                  <ImageStrip name={name} images={images} />
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
function ImageStrip({ name, images }: { name: string; images: CardImage[] }) {
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
    <div className="relative">
      <button type="button" aria-label="Scroll left" disabled={edge.start} onClick={() => go(-1)} className={arrow + " -left-3"}>
        <ChevronIcon className="h-5 w-5 rotate-180" />
      </button>
      <button type="button" aria-label="Scroll right" disabled={edge.end} onClick={() => go(1)} className={arrow + " -right-3"}>
        <ChevronIcon className="h-5 w-5" />
      </button>
      <ul ref={row} onScroll={measure} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]" aria-label="Scroll sideways for more">
        {images.map((img) => (
          <li key={img.label + img.url} className="w-[62vw] max-w-[18rem] shrink-0 snap-start sm:w-64">
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
  );
}
