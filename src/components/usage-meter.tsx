"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getDailyUsage } from "@/app/(app)/usage/actions";
import { USAGE_EVENT } from "@/lib/panel-events";
import type { DailyStatus } from "@/lib/daily-limits";
import { cn } from "@/lib/utils";

const left = (x: { used: number; limit: number | null }) => (x.limit == null ? null : Math.max(0, x.limit - x.used));

/**
 * Today's allowance in the header: prompts left, with a bar that turns amber then crimson as it runs out. Opens a small
 * card explaining what counts and when it resets. Own-key and admin accounts see "Unlimited".
 */
export function UsageMeter() {
  const [s, setS] = useState<DailyStatus | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void getDailyUsage().then((x) => alive && setS(x));
    load();
    window.addEventListener(USAGE_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(USAGE_EVENT, load);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!s) return null;
  const runsLeft = left(s.runs);
  const unlimited = runsLeft == null;
  const f = unlimited || !s.runs.limit ? 1 : runsLeft / s.runs.limit;
  const tone = unlimited ? "bg-emerald-400" : f > 0.5 ? "bg-emerald-400" : f > 0 ? "bg-amber-400" : "bg-brand-500";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unlimited ? "Prompts today: unlimited" : `${runsLeft} of ${s.runs.limit} prompts left today`}
        className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <span className="font-semibold tabular-nums text-neutral-100">{unlimited ? "∞" : `${runsLeft}/${s.runs.limit}`}</span>
        <span className="hidden sm:inline">{unlimited ? "Unlimited" : "prompts today"}</span>
        <span aria-hidden="true" className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-neutral-800 md:block">
          <span className={cn("block h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(4, f * 100)}%` }} />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 origin-top-right animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900/95 p-4 text-sm shadow-[0_20px_50px_-15px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          <p className="font-display text-base font-bold text-neutral-50">
            {s.ownKey ? "Your own AI key" : s.plan === "admin" ? "Admin" : s.plan === "pro" ? "Pro plan" : "Free plan"}
          </p>
          {unlimited ? (
            <p className="mt-1 text-neutral-400">{s.ownKey ? "Prompts use your own key, so there's no daily limit." : "No daily limit on this account."}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              <li>
                <div className="flex justify-between"><span className="text-neutral-300">Prompts</span><span className="tabular-nums text-neutral-100">{s.runs.used} of {s.runs.limit} used</span></div>
                <p className="text-xs text-neutral-500">Each target photo in Inject, and each press of Write variations, Write variant edits or Plan carousel.</p>
              </li>
              <li>
                <div className="flex justify-between"><span className="text-neutral-300">Likeness checks</span><span className="tabular-nums text-neutral-100">{s.likeness.used} of {s.likeness.limit} used</span></div>
              </li>
              <li className="text-xs text-neutral-500">Resets at midnight UTC. Copying prompts and switching options never counts.</li>
            </ul>
          )}
          {!s.ownKey && (
            <Link href="/settings/api-keys" onClick={() => setOpen(false)} className="mt-3 inline-block text-xs font-semibold text-brand-400 hover:text-brand-300">
              Use your own AI key for unlimited prompts →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
