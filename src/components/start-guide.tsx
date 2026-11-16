"use client";

import Link from "next/link";
import { GuideStepper, numberSteps } from "@/components/key-guide/guide-stepper";
import { START_GUIDE_PHASES, START_GUIDE_UPDATED } from "@/lib/start-guide";
import { FREE_CREDITS } from "@/lib/plans";

const STEPS = numberSteps(START_GUIDE_PHASES);

function Hero() {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(232_38_94/0.22),transparent_55%),radial-gradient(80%_120%_at_0%_100%,rgb(91_91_246/0.18),transparent_60%),var(--color-neutral-900)] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Getting started</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight text-neutral-50 max-sm:text-3xl">Your first image</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-300">
        Three things: <b className="font-semibold text-neutral-50">make her</b>, <b className="font-semibold text-neutral-50">put her in a photo</b>, and <b className="font-semibold text-neutral-50">pin your best one</b>. Follow along with the app open in another tab.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/reference-sheet" target="_blank" className="glow-brand inline-flex h-12 items-center rounded-xl bg-brand-500 px-6 text-base font-semibold text-white hover:bg-brand-400">
          Open Create Model
        </Link>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
          <li>⏱ ~10 minutes</li>
          <li>✨ {STEPS.length} steps</li>
          <li>🎁 {FREE_CREDITS} free tokens to start</li>
        </ul>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer id="guide-done" className="flex scroll-mt-28 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <p className="font-display text-2xl font-bold text-neutral-50">That&apos;s it. She&apos;s yours.</p>
        <p className="max-w-md text-sm text-neutral-400">Make more of her with Inject, describe a shot in Director, or get new takes on a picture you love in Variants.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/inject" className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-400">Open Inject</Link>
          <Link href="/home" className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 hover:border-neutral-500">Back to Home</Link>
        </div>
      </div>
      <p className="text-center text-xs text-neutral-500">Last updated {START_GUIDE_UPDATED}</p>
    </footer>
  );
}

/** The getting-started guide, in the same stepper as the API key guide. */
export function StartGuide() {
  return <GuideStepper phases={START_GUIDE_PHASES} storageKey="ms.startGuide.done" hero={<Hero />} footer={<Footer />} />;
}
