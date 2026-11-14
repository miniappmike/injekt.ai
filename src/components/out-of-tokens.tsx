"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Gift, X } from "lucide-react";
import { INVITE_PATH, inviteLabel } from "@/lib/invites";
import { useApp } from "@/components/app-context";
import { TokenIcon } from "@/components/token-icon";
import { parseCreditsMessage } from "@/lib/credits-message";
import { PRO } from "@/lib/plans";

const EVENT = "ms:out-of-tokens";
type Shortfall = { needed: number; balance: number };

/**
 * Pass any error an action returned through this. When it is the "not enough tokens" message, the Out of Tokens
 * pop-up opens. The text comes back unchanged either way, so it can wrap the value where the error is shown or stored.
 */
export function tokenGate<T extends string | null | undefined>(error: T): T {
  const shortfall = parseCreditsMessage(error);
  if (shortfall && typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Shortfall>(EVENT, { detail: shortfall }));
  return error;
}

/** The pop-up itself, mounted once for the signed-in pages. It opens when a tool runs short of tokens. */
export function OutOfTokens() {
  const { pro } = useApp();
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setShortfall(null);

  useEffect(() => {
    const open = (e: Event) => setShortfall((e as CustomEvent<Shortfall>).detail);
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);
  useEffect(() => {
    if (!shortfall) return;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setShortfall(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [shortfall]);

  if (!shortfall) return null;
  const { needed, balance } = shortfall;
  return (
    <div className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onClick={close}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="out-of-tokens-title"
        aria-describedby="out-of-tokens-body"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-sm animate-pop-in flex-col items-center overflow-hidden rounded-[2rem] border border-neutral-700/70 bg-neutral-900 px-6 pb-6 pt-10 text-center outline-none shadow-[0_40px_120px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.06)]"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-800/80 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
        <TokenIcon className="relative h-28 w-28 -rotate-12 drop-shadow-[0_14px_18px_rgb(0_0_0/0.55)]" />
        <h2 id="out-of-tokens-title" className="relative mt-7 font-display text-2xl font-bold tracking-tight text-neutral-50">Out of Tokens?</h2>
        <p id="out-of-tokens-body" className="relative mt-2 text-[15px] leading-relaxed text-neutral-300">
          This needs {needed} token{needed === 1 ? "" : "s"} and you have {balance}. Top up and keep creating.
        </p>
        <Link
          href="/tokens"
          onClick={close}
          className="relative mt-7 flex h-13 w-full items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgb(232_38_94/0.8)] transition-all duration-150 hover:from-brand-300 hover:to-brand-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          Get Tokens
        </Link>
        {/* The free way to more tokens, under the paid one. */}
        <Link
          href={INVITE_PATH}
          onClick={close}
          className="relative mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-iris-400/50 bg-iris-500/15 text-sm font-semibold text-indigo-100 transition-colors hover:bg-iris-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
        >
          <Gift aria-hidden="true" className="h-[18px] w-[18px]" />
          {inviteLabel()}
        </Link>
        {!pro && (
          <Link href="/upgrade" onClick={close} className="relative mt-4 rounded-md text-sm text-neutral-400 underline-offset-4 transition-colors hover:text-neutral-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            Or go Pro for {PRO.monthlyCredits} tokens a month
          </Link>
        )}
      </div>
    </div>
  );
}
