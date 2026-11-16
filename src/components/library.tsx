"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageBulkBar, SelectBox, useSelection } from "@/components/image-bulk-bar";
import { listLibrary, type LibraryCharacterFilter, type LibraryPage } from "@/app/(app)/library/actions";
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
  // Filters: one character (or "none" for images without one) and any number of tools.
  const [character, setCharacter] = useState<LibraryCharacterFilter>(null);
  const [kinds, setKinds] = useState<string[]>([]);

  // The grid is 5 wide on a computer and 2 wide on a phone, so its size follows the window.
  useEffect(() => {
    const q = window.matchMedia("(min-width: 640px)");
    const apply = () => setSize(q.matches ? DESKTOP_SIZE : MOBILE_SIZE);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);

  const load = useCallback(async (p: number, s: number, ch: LibraryCharacterFilter, ks: string[]) => {
    const mine = ++request.current;
    setError(false);
    try {
      const r = await listLibrary({ offset: (p - 1) * s, limit: s, characterId: ch, kinds: ks });
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
    void load(page, size, character, kinds);
  }, [page, size, character, kinds, load]);

  // An image deleted from the full-screen viewer: reload the page so the grid refills.
  useEffect(() => {
    const on = () => void load(page, size, character, kinds);
    window.addEventListener(GENERATION_DELETED_EVENT, on);
    return () => window.removeEventListener(GENERATION_DELETED_EVENT, on);
  }, [page, size, character, kinds, load]);

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

  // Changing a filter starts again from page 1.
  const filterBy = (ch: LibraryCharacterFilter, ks: string[]) => {
    sel.clear();
    setCharacter(ch);
    setKinds(ks);
    setPage(1);
  };
  const toggleKind = (k: string) => filterBy(character, kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const filtered = character !== null || kinds.length > 0;

  if (error) return <p role="alert" className="mt-6 text-sm text-red-400">Couldn&apos;t load your images. <button type="button" className="underline" onClick={() => void load(page, size, character, kinds)}>Try again</button></p>;
  if (!data) return <p role="status" className="mt-6 text-sm text-neutral-400">Loading…</p>;
  if (data.total === 0 && !filtered) return <p className="panel mt-6 p-6 text-center text-sm text-neutral-400">No active images yet. Images you make are kept here for 72 hours.</p>;

  const withImages = data.characters.filter((c) => data.characterCounts[c.id]).sort((a, b) => a.name.localeCompare(b.name));
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
      on ? "border-brand-400 bg-brand-500/15 text-brand-100" : "border-neutral-700 bg-neutral-950/60 text-neutral-300 hover:border-neutral-500",
    );

  const shot = (x: (typeof images)[number]) => ({ url: x.url, downloadUrl: x.downloadUrl, prompt: x.prompt, title: `${nameOf(x.characterId) ? `${nameOf(x.characterId)}: ` : ""}${x.label}`, generated: true, generationId: x.id });
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={character ?? ""}
            onChange={(e) => filterBy(e.target.value || null, kinds)}
            aria-label="Filter by character"
            className="h-9 min-w-0 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm text-neutral-200 max-sm:w-full"
          >
            <option value="">All characters</option>
            {withImages.map((c) => <option key={c.id} value={c.id}>{c.name} ({data.characterCounts[c.id]})</option>)}
            {data.noCharacter > 0 && <option value="none">No character ({data.noCharacter})</option>}
          </select>
          <div role="group" aria-label="Filter by tool (pick any number)" className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed={!kinds.length} onClick={() => filterBy(character, [])} className={chip(!kinds.length)}>All tools</button>
            {data.tools.map((t) => (
              <button key={t.kind} type="button" aria-pressed={kinds.includes(t.kind)} onClick={() => toggleKind(t.kind)} className={chip(kinds.includes(t.kind))}>
                {t.label}
                <span className="tabular-nums text-neutral-500">{t.count}</span>
              </button>
            ))}
          </div>
          {filtered && (
            <button type="button" onClick={() => filterBy(null, [])} className="text-xs font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-200">Clear filters</button>
          )}
        </div>
        <ImageBulkBar
          floating
          items={images.map((i) => ({ id: i.id, url: i.url, downloadUrl: i.downloadUrl, characterId: i.characterId, kind: i.kind }))}
          picked={sel.picked}
          onSelectAll={sel.selectAll}
          onClear={sel.clear}
          onDeleted={(ids) => {
            sel.drop(ids);
            void load(page, size, character, kinds);
          }}
          slots={freeSlots}
          onPinned={(id, n) => setPinned((p) => ({ ...p, [id]: (p[id] ?? 0) + n }))}
        />
      </div>

      {data.total === 0 && <p className="panel p-6 text-center text-sm text-neutral-400">No images match these filters.</p>}

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
          <PageJump page={page} pages={pages} onGo={go} />
          <Button type="button" size="sm" variant="secondary" disabled={page >= pages} onClick={() => go(page + 1)}>Next</Button>
        </nav>
      )}
    </div>
  );
}

/** "Page [n] of N": type a page number and press Enter (or leave the box) to go there. */
function PageJump({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  const [text, setText] = useState(String(page));
  useEffect(() => setText(String(page)), [page]);
  const submit = () => {
    const n = Math.floor(Number(text));
    if (Number.isFinite(n) && n >= 1 && n !== page) onGo(Math.min(n, pages));
    else setText(String(page));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 text-sm tabular-nums text-neutral-400"
    >
      <label htmlFor="library-page">Page</label>
      <input
        id="library-page"
        type="number"
        inputMode="numeric"
        min={1}
        max={pages}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 w-14 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-2 text-center text-neutral-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span>of {pages}</span>
    </form>
  );
}
