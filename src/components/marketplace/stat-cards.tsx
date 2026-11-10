"use client";

import { cn } from "@/lib/utils";
import { Odometer } from "@/components/marketplace/odometer";

export interface Stat {
  label: string;
  /** A number rolls in; text is shown as it is. */
  value: number | string;
  prefix?: string;
  unit?: string;
  /** A short plain-English line under the number. */
  caption?: string;
}

// Each card has its own height and tint, so the row looks staggered rather than like a table.
const LOOKS = [
  { h: "h-44", tone: "bg-gradient-to-b from-brand-500 to-brand-700 text-white" },
  { h: "h-52", tone: "bg-neutral-100 text-neutral-950" },
  { h: "h-40", tone: "bg-neutral-800 text-neutral-50 ring-1 ring-white/10" },
  { h: "h-48", tone: "bg-gradient-to-b from-iris-500 to-iris-600 text-white" },
];

/** Long numbers get a smaller size so four cards fit side by side. */
const size = (v: number | string) => {
  const n = String(v).length;
  return n <= 2 ? "text-[4rem]" : n === 3 ? "text-[3.2rem]" : n === 4 ? "text-[2.35rem]" : "text-[1.85rem]";
};

/** A sideways row of tall stat cards with huge condensed numbers and small units. */
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <ul className="no-scrollbar -mx-4 flex items-end gap-3 overflow-x-auto px-4 py-2 sm:mx-0 sm:px-0 sm:overflow-visible" aria-label="Quick facts">
      {stats.map((s, i) => {
        const look = LOOKS[i % LOOKS.length];
        return (
          <li key={s.label} className={cn("flex w-40 shrink-0 flex-col sm:w-auto sm:min-w-0 sm:flex-1 sm:shrink justify-between rounded-[1.6rem] p-4 shadow-xl", look.h, look.tone)}>
            <span className="text-xs font-semibold tracking-wide uppercase opacity-80">{s.label}</span>
            <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-1 font-poster">
              {s.prefix && <span className="text-3xl leading-none opacity-80">{s.prefix}</span>}
              <span className={cn("leading-[0.85]", size(s.value))}>{typeof s.value === "number" ? <Odometer value={s.value} /> : s.value}</span>
              {s.unit && <span className="font-sans text-xs font-semibold opacity-75">{s.unit}</span>}
            </span>
            {s.caption && <span className="text-[11px] leading-tight font-medium opacity-80">{s.caption}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
