"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CardsIcon, GridIcon } from "@/components/icons";
import { SORTS, type SortKey, type ViewMode } from "@/lib/marketplace/view";

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";
/** Every control in the toolbar row is a 40px pill with the same border. */
const field = "inline-flex h-10 items-center rounded-full border border-neutral-800 transition-colors duration-150 motion-reduce:transition-none";

/** Available / Sold: white pill when active, outlined when not, each with a small count badge. */
export function TabPills<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count: number }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Marketplace" className="flex items-center gap-3 max-sm:w-full">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={cn(
              field,
              ring,
              "justify-center gap-2 px-4 text-sm font-semibold max-sm:flex-1",
              on ? "border-white bg-white text-neutral-950" : "text-neutral-300 hover:border-neutral-600 hover:text-neutral-50",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 py-px text-xs font-semibold tabular-nums", on ? "bg-neutral-950/10 text-neutral-700" : "bg-neutral-800 text-neutral-400")}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One sort dropdown (button + listbox). Arrows move, Enter/Space picks, Esc or an outside click closes. It only reorders. */
export function SortControl({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = SORTS.find((s) => s.key === value) ?? SORTS[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function show() {
    setHi(Math.max(0, SORTS.findIndex((s) => s.key === value)));
    setOpen(true);
  }
  function choose(i: number) {
    onChange(SORTS[i].key);
    setOpen(false);
    btn.current?.focus();
  }
  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") (e.preventDefault(), show());
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => (h + 1) % SORTS.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => (h - 1 + SORTS.length) % SORTS.length));
    else if (e.key === "Home") (e.preventDefault(), setHi(0));
    else if (e.key === "End") (e.preventDefault(), setHi(SORTS.length - 1));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), choose(hi));
    else if (e.key === "Escape") (e.preventDefault(), setOpen(false));
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="relative min-w-0 max-sm:flex-1" onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(field, ring, "w-full justify-between gap-2 bg-neutral-900/70 pr-3 pl-4 text-sm font-semibold text-neutral-100 hover:border-neutral-600 sm:w-auto")}
      >
        <span className="truncate">
          <span className="font-medium text-neutral-400">Sort: </span>
          {current.label}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("h-4 w-4 shrink-0 fill-none stroke-current text-neutral-400 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sort by"
          aria-activedescendant={`${listId}-${hi}`}
          tabIndex={-1}
          ref={(el) => el?.focus({ preventScroll: true })}
          className="animate-fade-up absolute top-full right-0 z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-800 bg-neutral-900 p-1.5 shadow-2xl shadow-black/60 focus:outline-none max-sm:left-0 max-sm:w-full"
        >
          {SORTS.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={s.key === value}
              onPointerEnter={() => setHi(i)}
              onClick={() => choose(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm", i === hi ? "bg-neutral-800 text-neutral-50" : "text-neutral-300", s.key === value && "font-semibold")}
            >
              {s.label}
              {s.key === value && (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-brand-400" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Cards (the coverflow) or Grid: two 36px icon buttons in a pill track. */
export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const items = [
    { key: "cards" as const, label: "Cards", Icon: CardsIcon },
    { key: "grid" as const, label: "Grid", Icon: GridIcon },
  ];
  return (
    <div role="group" aria-label="View" className={cn(field, "shrink-0 gap-0.5 bg-neutral-900/70 p-0.5")}>
      {items.map(({ key, label, Icon }) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            aria-label={`${label} view`}
            title={`${label} view`}
            onClick={() => onChange(key)}
            className={cn(ring, "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none", on ? "bg-neutral-700 text-neutral-50" : "text-neutral-400 hover:text-neutral-100")}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
