"use client";

import Link from "next/link";
import { GUIDE_BALANCE_NOTE, GUIDE_PHASES, GUIDE_UPDATED } from "@/lib/key-guide";
import { GENERATION_SETTINGS_PATH } from "@/lib/links";
import { cn } from "@/lib/utils";
import { GuideStepper, numberSteps } from "./guide-stepper";
import { SpicyCta } from "./parts";

const STEPS = numberSteps(GUIDE_PHASES);

function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <header className={cn("relative overflow-hidden rounded-3xl border border-neutral-800 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(232_38_94/0.22),transparent_55%),radial-gradient(80%_120%_at_0%_100%,rgb(91_91_246/0.18),transparent_60%),var(--color-neutral-900)]", compact ? "p-6" : "p-8 max-sm:p-5")}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">API key guide</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight text-neutral-50 max-sm:text-3xl">Get your own API key</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-300">
        One SpicyAPI key unlocks image generation here and prompt writing with no daily limit. Setup takes about 5 minutes, and you pay SpicyAPI only for what you use.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SpicyCta disclosure={false} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
          <li>⏱ ~5 minutes</li>
          <li>🔑 {STEPS.length} steps</li>
          <li>💳 Pay as you go</li>
        </ul>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer id="guide-done" className="flex scroll-mt-28 flex-col gap-4">
      <div className="rounded-2xl border border-iris-500/30 bg-iris-500/[0.06] p-5">
        <p className="font-display text-lg font-bold text-neutral-50">Before you generate</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">{GUIDE_BALANCE_NOTE}</p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <p className="font-display text-2xl font-bold text-neutral-50">That&apos;s it. You&apos;re all set.</p>
        <p className="max-w-md text-sm text-neutral-400">Image generation is on and every tool in ModelSpawn is yours to use.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/inject" className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-400">Start creating</Link>
          <Link href={GENERATION_SETTINGS_PATH} className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 hover:border-neutral-500">Open Settings</Link>
        </div>
      </div>
      <p className="text-center text-xs text-neutral-500">Last updated {GUIDE_UPDATED}</p>
    </footer>
  );
}

/** The API key guide: one step at a time with a big screenshot, Back and Next, and a checklist that remembers progress. */
export function KeyGuide() {
  return <GuideStepper phases={GUIDE_PHASES} storageKey="ms.keyGuide.done" hero={<Hero compact />} footer={<Footer />} />;
}
