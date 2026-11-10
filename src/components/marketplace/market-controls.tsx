"use client";

import { cn } from "@/lib/utils";
import { CardsIcon, GridIcon } from "@/components/icons";
import { SORTS, type SortKey, type ViewMode } from "@/lib/marketplace/view";

const track = "inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]";
const pill = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
    on ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_14px_-4px_rgb(232_38_94/0.7)]" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50",
  );

/** How the personas are ordered: pills on a computer, a compact dropdown on a phone. It only reorders, never hides. */
export function SortControl({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  return (
    <div className="min-w-0 max-sm:flex-1">
      <div role="group" aria-label="Sort by" className={cn(track, "no-scrollbar max-w-full overflow-x-auto max-sm:hidden")}>
        {SORTS.map((s) => (
          <button key={s.key} type="button" aria-pressed={value === s.key} onClick={() => onChange(s.key)} className={pill(value === s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="relative block sm:hidden">
        <span className="sr-only">Sort by</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SortKey)}
          className="h-11 w-full appearance-none rounded-2xl border border-neutral-800 bg-neutral-900 pr-9 pl-4 text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key === "trending" ? "Sort: Trending" : s.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 rotate-90 text-neutral-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
        </span>
      </label>
    </div>
  );
}

/** Cards (the coverflow) or Grid. Icons on a phone, icons and words on a computer. */
export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const items = [
    { key: "cards" as const, label: "Cards", Icon: CardsIcon },
    { key: "grid" as const, label: "Grid", Icon: GridIcon },
  ];
  return (
    <div role="group" aria-label="View" className={cn(track, "shrink-0 max-sm:h-11 max-sm:rounded-2xl")}>
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          aria-label={`${label} view`}
          onClick={() => onChange(key)}
          className={cn(pill(value === key), "max-sm:h-9 max-sm:w-10 max-sm:justify-center max-sm:rounded-xl max-sm:px-0")}
        >
          <Icon className="h-4 w-4" />
          <span className="max-sm:hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}
