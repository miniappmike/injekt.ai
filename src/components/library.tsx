"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageBulkBar, SelectBox, useSelection } from "@/components/image-bulk-bar";
import { listLibrary, type LibraryPage } from "@/app/(app)/library/actions";
import { GENERATION_DELETED_EVENT, viewImage } from "@/lib/panel-events";
import { shortTimeLeft } from "@/lib/retention";
import { cn } from "@/lib/utils";

/** 5 x 5 on a computer, 2 x 5 on a phone. */
const DESKTOP_SIZE = 25;
const MOBILE_SIZE = 10;

const hoursLeft = (iso: string) => shortTimeLeft(iso);

/** The Library: every active image in a grid, a page at a time, with the same multi-image tools as a character's panel. */
export function Library() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DESKTOP_SIZE);
  const [data, setData] = useState<LibraryPage | null>(null);
  const [error, setError] = useState(false);
  const [pinned, setPinned] = useState<Record<string, number>>({});
  const request = useRef(0);

  // The grid is 5 wide on a computer and 2 wide on a phone, so its size follows the window.
  useEffect(() => {
    const q = window.matchMedia("(min-width: 640px)");
    const apply = () => setSize(q.matches ? DESKTOP_SIZE : MOBILE_SIZE);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);

  const load = useCallback(async (p: number, s: number) => {
    const mine = ++request.current;
    setError(false);
    try {
      const r = await listLibrary({ offset: (p - 1) * s, limit: s });
      if (mine !== request.current) return;
      // Deleting the last image of a page leaves it empty: step back.
      if (!r.images.length && r.total > 0 && p > 1) return setPage(Math.max(1, Math.ceil(r.total / s)));
      setData(r);
      setPinned({});
    } catch {
      if (mine === request.current) setError(true);
    }
  }, []);
  useEffect(() => {
    void load(page, size);
  }, [page, size, load]);

  // An image deleted from the full-screen viewer: reload the page so the grid refills.
  useEffect(() => {
    const on = () => void load(page, size);
    window.addEventListener(GENERATION_DELETED_EVENT, on);
    return () => window.removeEventListener(GENERATION_DELETED_EVENT, on);
  }, [page, size, load]);

  const images = data?.images ?? [];
  const sel = useSelection(images.map((i) => i.id));
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const nameOf = (id: string | null) => data?.characters.find((c) => c.id === id)?.name;
  const freeSlots = (id: string) => {
    const c = data?.characters.find((x) => x.id === id);
    return c ? Math.max(0, data!.maxRefs - c.refCount - (pinned[id] ?? 0)) : null;
  };
  const go = (p: number) => {
    sel.clear();
    setPage(Math.min(Math.max(1, p), pages));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) return <p role="alert" className="mt-6 text-sm text-red-400">Couldn&apos;t load your images. <button type="button" className="underline" onClick={() => void load(page, size)}>Try again</button></p>;
  if (!data) return <p role="status" className="mt-6 text-sm text-neutral-400">Loading…</p>;
  if (data.total === 0) return <p className="panel mt-6 p-6 text-center text-sm text-neutral-400">No active images yet. Images you make are kept here for 72 hours.</p>;

  const shot = (x: (typeof images)[number]) => ({ url: x.url, downloadUrl: x.downloadUrl, prompt: x.prompt, title: `${nameOf(x.characterId) ? `${nameOf(x.characterId)}: ` : ""}${x.label}`, generated: true, generationId: x.id });
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel p-3 sm:p-4">
        <ImageBulkBar
          floating
          items={images.map((i) => ({ id: i.id, url: i.url, downloadUrl: i.downloadUrl, characterId: i.characterId, kind: i.kind }))}
          picked={sel.picked}
          onSelectAll={sel.selectAll}
          onClear={sel.clear}
          onDeleted={(ids) => {
            sel.drop(ids);
            void load(page, size);
          }}
          slots={freeSlots}
          onPinned={(id, n) => setPinned((p) => ({ ...p, [id]: (p[id] ?? 0) + n }))}
        />
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
        {images.map((img) => (
          <li key={img.id} className="relative">
            <SelectBox checked={sel.has(img.id)} onChange={() => sel.toggle(img.id)} label={`Select ${img.label}`} />
            <button
              type="button"
              onClick={() => viewImage({ ...shot(img), gallery: images.map(shot) })}
              className={cn("group block w-full overflow-hidden rounded-xl border bg-neutral-950 text-left transition-colors hover:border-brand-500/50", sel.has(img.id) ? "border-brand-500" : "border-neutral-800")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.label} loading="lazy" className="aspect-[3/4] w-full bg-neutral-900 object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" />
              <span className="block truncate px-2 pt-1.5 text-xs font-medium text-neutral-200">{nameOf(img.characterId) ?? img.label}</span>
              <span className="block truncate px-2 pb-1.5 text-[11px] text-neutral-500">{nameOf(img.characterId) ? `${img.label} · ` : ""}{hoursLeft(img.expiresAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</Button>
          <span className="text-sm tabular-nums text-neutral-400">Page {page} of {pages}</span>
          <Button type="button" size="sm" variant="secondary" disabled={page >= pages} onClick={() => go(page + 1)}>Next</Button>
        </nav>
      )}
    </div>
  );
}
