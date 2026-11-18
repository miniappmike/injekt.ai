"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CharacterCard, type CharacterCardData } from "@/components/character-card";
import { cn } from "@/lib/utils";
import { reorderCharacters } from "@/app/(app)/characters/order-actions";

type Sort = "updated" | "created" | "custom";
const SORTS: { value: Sort; label: string }[] = [
  { value: "custom", label: "Custom order" },
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Latest created" },
];
const SORT_KEY = "ms.characterSort";
const time = (s?: string) => (s ? Date.parse(s) : 0);

/** Custom order: arranged characters by their place; never-arranged ones (e.g. new) first, newest first. */
function customOrder(list: CharacterCardData[]) {
  return [...list].sort((a, b) => {
    const x = a.sortOrder ?? null;
    const y = b.sortOrder ?? null;
    if (x === null && y === null) return time(b.createdAt) - time(a.createdAt);
    if (x === null) return -1;
    if (y === null) return 1;
    return x - y;
  });
}

const move = (ids: string[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
};

/**
 * The characters grid: sort, rearrange and New character. Group photos are no longer made here: adding characters
 * under the picker in Director or Inject turns those tools into group photo mode (src/components/group-add.tsx).
 */
export function CharactersBoard({ characters, canList, canDuplicate = false, atLimit, limitText }: { characters: CharacterCardData[]; canList: boolean; canDuplicate?: boolean; atLimit: boolean; limitText: string }) {

  // Sorting: remembered per browser. The saved custom order is kept locally too, so it shows at once after Done.
  const [sort, setSort] = useState<Sort>("created");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      if (saved === "updated" || saved === "created" || saved === "custom") setSort(saved);
    } catch {}
  }, []);
  const chooseSort = (v: Sort) => {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {}
  };
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const shown = useMemo(() => {
    if (sort === "updated") return [...characters].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    if (sort === "created") return [...characters].sort((a, b) => time(b.createdAt) - time(a.createdAt));
    const base = customOrder(characters);
    if (!savedOrder) return base;
    // Anything not in the locally saved order (added since) goes first, as in customOrder.
    const at = new Map(savedOrder.map((id, i) => [id, i]));
    return [...base.filter((c) => !at.has(c.id)), ...base.filter((c) => at.has(c.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!)];
  }, [characters, sort, savedOrder]);

  // Rearrange mode: cards become drag targets (arrows too, for touch screens); Done saves, Cancel puts it back.
  const [arranging, setArranging] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [orderError, setOrderError] = useState<string | null>(null);
  const startArranging = () => {
    setOrderError(null);
    setArranging(shown.map((c) => c.id));
    chooseSort("custom");
  };
  const finishArranging = () => {
    const ids = arranging;
    if (!ids) return;
    startSaving(async () => {
      const res = await reorderCharacters(ids);
      if (res.error) {
        setOrderError(res.error);
        return;
      }
      setSavedOrder(ids);
      setArranging(null);
    });
  };
  const byId = new Map(characters.map((c) => [c.id, c]));
  const list = arranging ? arranging.map((id) => byId.get(id)).filter((c): c is CharacterCardData => !!c) : shown;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 max-sm:mb-4">
        <h1 className="page-title">Characters</h1>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {characters.length > 1 && (
            arranging ? (
              <>
                <Button type="button" variant="outline" disabled={saving} onClick={() => setArranging(null)} className="max-sm:flex-1">Cancel</Button>
                <Button type="button" disabled={saving} onClick={finishArranging} className="max-sm:flex-1">{saving ? "Saving..." : "Done"}</Button>
              </>
            ) : (
              <>
                <select
                  value={sort}
                  onChange={(e) => chooseSort(e.target.value as Sort)}
                  aria-label="Sort characters"
                  className="h-10 min-w-0 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm text-neutral-200 max-sm:flex-1"
                >
                  {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <Button type="button" variant="outline" onClick={startArranging} title="Drag your characters into your own order" className="max-sm:flex-1">Rearrange</Button>
              </>
            )
          )}
          {arranging ? null : atLimit ? (
            <Button disabled className="max-sm:flex-1">New character</Button>
          ) : (
            <Button asChild className="max-sm:flex-1"><Link href="/characters/new">New character</Link></Button>
          )}
        </div>
      </div>
      {atLimit && <p className="mb-4 text-sm text-neutral-400">{limitText}</p>}
      {arranging && (
        <p className="mb-4 flex animate-fade-up items-center gap-2 text-sm text-neutral-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" aria-hidden="true" />
          Drag a character onto another to move her there (or use the arrows), then press Done.
        </p>
      )}
      {orderError && <p role="alert" className="mb-4 text-sm text-red-400">{orderError}</p>}
      {!characters.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-700 px-6 py-16 text-center">
          <p className="text-neutral-400">No characters yet. Create your first one.</p>
        </div>
      ) : (
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {list.map((c, idx) => {
            return (
              <div key={c.id} className="relative">
                <CharacterCard c={c} canList={canList} canDuplicate={canDuplicate} />
                {arranging && (
                  <div
                    draggable={!saving}
                    onDragStart={(e) => {
                      setDragging(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging) setArranging((ids) => ids && move(ids, ids.indexOf(dragging), idx));
                      setDragging(null);
                    }}
                    className={cn(
                      "absolute inset-0 z-20 animate-fade-in cursor-grab rounded-2xl ring-2 ring-inset ring-brand-400/40 transition-all duration-200 active:cursor-grabbing max-sm:rounded-[1.25rem]",
                      dragging === c.id ? "bg-black/50 opacity-60" : "bg-black/10 hover:ring-brand-400",
                    )}
                  >
                    <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-lg ring-1 ring-white/30 max-sm:left-2 max-sm:top-2">
                      {idx + 1}
                    </span>
                    <div className="absolute inset-x-3 top-[40%] flex -translate-y-1/2 justify-between max-sm:inset-x-2">
                      <button type="button" aria-label={`Move ${c.name} earlier`} disabled={saving || idx === 0} onClick={() => setArranging((ids) => ids && move(ids, idx, idx - 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-lg leading-none text-white ring-1 ring-white/20 disabled:opacity-30">‹</button>
                      <button type="button" aria-label={`Move ${c.name} later`} disabled={saving || idx === list.length - 1} onClick={() => setArranging((ids) => ids && move(ids, idx, idx + 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-lg leading-none text-white ring-1 ring-white/20 disabled:opacity-30">›</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
