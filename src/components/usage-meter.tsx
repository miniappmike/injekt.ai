"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getDailyUsage } from "@/app/(app)/usage/actions";
import { GENERATION_EVENT, USAGE_EVENT, type TrayGeneration } from "@/lib/panel-events";
import type { DailyStatus } from "@/lib/daily-limits";
import { cn } from "@/lib/utils";
import { IMAGE_CREDITS, PROFILE_BUILD_CREDITS, PROMPT_CREDITS, PRO } from "@/lib/plans";
import { ProGem } from "@/components/pro-badge";
import { TokenIcon } from "@/components/token-icon";

const left = (x: { used: number; limit: number | null }) => (x.limit == null ? null : Math.max(0, x.limit - x.used));
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Tokens in the header: the token and a white count, with the plan. Opens a card with what things cost, the free plan's daily limits (with bars
 * that turn amber then crimson as they run out), when Pro ends, and links to buy tokens or upgrade.
 */
export function UsageMeter() {
  const [s, setS] = useState<DailyStatus | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => void getDailyUsage().then((x) => alive && setS(x));
    // Several updates in a row (a batch of images, a prompt run) become one reload.
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 1500);
    };
    load();
    window.addEventListener(USAGE_EVENT, soon);
    // Tokens change only when an image starts (spent) or fails (given back); in-between updates are ignored.
    const seen = new Set<string>();
    const onGeneration = (e: Event) => {
      const g = (e as CustomEvent<TrayGeneration>).detail;
      const step = `${g.key}:${g.state === "generating" ? (g.generationId ? "started" : "") : g.state}`;
      if (!g || step.endsWith(":") || seen.has(step)) return;
      seen.add(step);
      soon();
    };
    window.addEventListener(GENERATION_EVENT, onGeneration);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener(USAGE_EVENT, soon);
      window.removeEventListener(GENERATION_EVENT, onGeneration);
    };
  }, []);

  return s ? <UsageMeterView s={s} /> : null;
}

/** The meter itself, for a given status. */
export function UsageMeterView({ s, startOpen = false }: { s: DailyStatus; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const credits = s.credits ?? 0;
  const pro = s.plan !== "free";
  const low = credits < IMAGE_CREDITS["1k"];
  const endsSoon = s.proUntil && Date.parse(s.proUntil) - Date.now() < PRO.remindDays * 86_400_000;

  const bar = (label: string, x: { used: number; limit: number | null }) => {
    const l = left(x);
    if (l == null || x.limit == null) return null;
    const f = x.limit ? l / x.limit : 0;
    return (
      <li>
        <div className="flex justify-between"><span className="text-neutral-300">{label}</span><span className="tabular-nums text-neutral-100">{x.used} of {x.limit} used</span></div>
        <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <span className={cn("block h-full rounded-full", f > 0.5 ? "bg-emerald-400" : f > 0 ? "bg-amber-400" : "bg-brand-500")} style={{ width: `${Math.max(4, f * 100)}%` }} />
        </span>
      </li>
    );
  };

  return (
    <div ref={root} className="relative">
      {/* The count goes to the Tokens page to top up; the arrow beside it opens the details. */}
      <div className="flex h-9 items-center rounded-lg text-sm text-neutral-300 max-sm:h-10 max-sm:rounded-xl max-sm:border max-sm:border-neutral-800 max-sm:bg-neutral-900">
        <Link
          href="/tokens"
          aria-label={`${credits} tokens${pro ? ", Pro" : ""}. Buy tokens`}
          className="flex h-full items-center gap-2 rounded-l-lg pl-2.5 pr-1.5 transition-colors hover:bg-neutral-800 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 max-sm:rounded-l-xl max-sm:pl-3"
        >
          <TokenIcon className="h-[18px] w-[18px]" />
          <span className={cn("font-semibold tabular-nums", low ? "text-amber-200" : "text-white")}>{credits.toLocaleString()}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Token details"
          className="grid h-full w-7 place-items-center rounded-r-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 max-sm:rounded-r-xl max-sm:w-8"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("h-3.5 w-3.5 fill-none stroke-current transition-transform", open && "rotate-180")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto max-sm:bg-neutral-900 max-sm:backdrop-blur-none origin-top-left animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900/95 p-4 text-sm shadow-[0_20px_50px_-15px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-base font-bold text-neutral-50">{s.plan === "admin" ? "Admin" : pro ? "Pro plan" : "Free plan"}</p>
            {pro && <ProGem className="h-6 w-6" glow={false} />}
          </div>
          <p className="mt-1 text-neutral-400">
            <b className="tabular-nums text-neutral-100">{credits.toLocaleString()}</b> tokens to spend.
            {s.proUntil && <> Pro {Date.parse(s.proUntil) > Date.now() ? "until" : "ended"} <b className={cn(endsSoon ? "text-amber-300" : "text-neutral-200")}>{day(s.proUntil)}</b>.</>}
          </p>

          <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-neutral-950/60 p-2.5 text-xs text-neutral-400">
            <li className="flex justify-between"><span>Image (1k / 1.5k / 2k)</span><span className="tabular-nums text-neutral-200">{IMAGE_CREDITS["1k"]} / {IMAGE_CREDITS["1.5k"]} / {IMAGE_CREDITS["2k"]}</span></li>
            <li className="flex justify-between"><span>Prompt</span><span className="tabular-nums text-neutral-200">{PROMPT_CREDITS}</span></li>
            <li className="flex justify-between"><span>Build profile</span><span className="tabular-nums text-neutral-200">{PROFILE_BUILD_CREDITS}</span></li>
            {s.ownKey && <li className="pt-1 text-emerald-300">Your own keys are in use: they cost no tokens.</li>}
          </ul>

          {s.plan === "free" && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Today</p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {bar("Prompts", s.runs)}
                {bar("Images", s.images)}
                {bar("Likeness checks", s.likeness)}
                <li className="text-xs text-neutral-500">Resets at midnight UTC. Pro has no daily limits.</li>
              </ul>
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/tokens" onClick={() => setOpen(false)} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition-colors hover:bg-neutral-700">
              Buy tokens
            </Link>
            {(s.plan === "free" || endsSoon) && (
              <Link href="/upgrade" onClick={() => setOpen(false)} className="rounded-lg bg-gradient-to-r from-brand-400 to-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">
                {s.plan === "free" ? "Upgrade to Pro" : "Renew Pro"}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
