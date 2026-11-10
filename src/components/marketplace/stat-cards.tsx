"use client";

import { cn } from "@/lib/utils";
import { Odometer } from "@/components/marketplace/odometer";

export interface Stat {
  label: string;
  /** A number rolls in; text is shown as it is. */
  value: number | string;
  prefix?: string;
  unit?: string;
}

// Each card has its own height and tint, so the row looks staggered rather than like a table.
const LOOKS = [
  { h: "h-44", tone: "bg-gradient-to-b from-brand-500 to-brand-700 text-white" },
  { h: "h-52", tone: "bg-neutral-100 text-neutral-950" },
  { h: "h-40", tone: "bg-neutral-800 text-neutral-50 ring-1 ring-white/10" },
  { h: "h-48", tone: "bg-gradient-to-b from-iris-500 to-iris-600 text-white" },
];

/** A sideways row of tall stat cards with huge condensed numbers and small units. */
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <ul className="no-scrollbar -mx-4 flex items-end gap-3 overflow-x-auto px-4 py-2 sm:mx-0 sm:px-0" aria-label="Quick facts">
      {stats.map((s, i) => {
        const look = LOOKS[i % LOOKS.length];
        return (
          <li key={s.label} className={cn("flex w-40 shrink-0 flex-col justify-between rounded-[1.6rem] p-4 shadow-xl", look.h, look.tone)}>
            <span className="text-xs font-semibold tracking-wide uppercase opacity-80">{s.label}</span>
            <span className="flex items-baseline gap-1 font-poster">
              {s.prefix && <span className="text-3xl leading-none opacity-80">{s.prefix}</span>}
              <span className="text-[4rem] leading-[0.85]">{typeof s.value === "number" ? <Odometer value={s.value} /> : s.value}</span>
              {s.unit && <span className="font-sans text-xs font-semibold opacity-75">{s.unit}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
