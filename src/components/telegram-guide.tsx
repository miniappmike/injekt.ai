"use client";

import Link from "next/link";
import { GuideStepper, numberSteps } from "@/components/key-guide/guide-stepper";
import { PlaneIcon } from "@/components/pay-buttons";
import { CONTACT_EMAIL } from "@/lib/links";
import { TELEGRAM_GUIDE_PHASES, TELEGRAM_GUIDE_UPDATED } from "@/lib/telegram-guide";

const STEPS = numberSteps(TELEGRAM_GUIDE_PHASES);

function Hero() {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(232_38_94/0.22),transparent_55%),radial-gradient(80%_120%_at_0%_100%,rgb(42_171_238/0.16),transparent_60%),var(--color-neutral-900)] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Payment guide</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight text-neutral-50 max-sm:text-3xl">How to pay with Telegram</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-300">
        Pay for tokens or Pro with <b className="font-semibold text-neutral-50">Telegram Stars</b>. You start on ModelSpawn, confirm in Telegram, and your purchase is added <em>straight away</em>.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/tokens" target="_blank" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#37aee2] to-[#1e96c8] px-6 text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgb(42_171_238/0.8)] transition hover:brightness-110 active:scale-95">
          <PlaneIcon className="h-4 w-4" /> Open Tokens
        </Link>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
          <li>⏱ ~3 minutes</li>
          <li>⭐ {STEPS.length} steps</li>
          <li>💳 Card, Apple Pay or Google Pay</li>
        </ul>
      </div>
    </header>
  );
}

function Footer() {
  const link = "font-semibold text-brand-300 underline-offset-4 hover:underline";
  return (
    <footer id="guide-done" className="flex scroll-mt-28 flex-col gap-4">
      <div className="rounded-2xl border border-[#2aabee]/30 bg-[#2aabee]/[0.06] p-5">
        <p className="font-display text-lg font-bold text-neutral-50">Need a hand?</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">
          Email <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a> with your Telegram payment receipt, or send{" "}
          <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100">/support</code> to the ModelSpawn bot. All sales are final, as set out in our{" "}
          <Link href="/terms" target="_blank" className={link}>Terms</Link>.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <p className="font-display text-2xl font-bold text-neutral-50">That&apos;s it. You&apos;re all set.</p>
        <p className="max-w-md text-sm text-neutral-400">Your tokens are in your account and ready to use.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/inject" className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-400">Start creating</Link>
          <Link href="/tokens" className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 hover:border-neutral-500">Back to Tokens</Link>
        </div>
      </div>
      <p className="text-center text-xs text-neutral-500">Last updated {TELEGRAM_GUIDE_UPDATED}</p>
    </footer>
  );
}

/** The Telegram payment guide, in the same step-by-step layout as the API key guide. */
export function TelegramGuide() {
  return <GuideStepper phases={TELEGRAM_GUIDE_PHASES} storageKey="ms.telegramGuide.done" hero={<Hero />} footer={<Footer />} />;
}
