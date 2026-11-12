"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlaneIcon } from "@/components/pay-buttons";
import { TELEGRAM_GUIDE_PATH } from "@/lib/links";

/**
 * The step before paying with Telegram: what they're buying, a short note, a Continue to payment button (which makes
 * the Telegram payment link and opens it), and under it a link to the how-to guide.
 */
export function TelegramPayDialog({
  open,
  what,
  stars,
  onClose,
  makeLink,
}: {
  open: boolean;
  /** What they're buying, e.g. "ModelSpawn Pro" or "525 tokens". */
  what: string;
  stars: number;
  onClose: () => void;
  /** Creates the order and its Telegram payment link, or returns an error message. */
  makeLink: () => Promise<{ url: string } | { error: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const panel = useRef<HTMLDivElement>(null);

  // Fresh each time it opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(undefined);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  async function go() {
    setBusy(true);
    setError(undefined);
    const r = await makeLink();
    if ("error" in r) {
      setBusy(false);
      return setError(r.error);
    }
    window.location.href = r.url;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onPointerDown={(e) => !panel.current?.contains(e.target as Node) && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-pay-title"
        className="relative w-full max-w-sm animate-pop-in rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 stroke-current" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#37aee2] to-[#1e96c8] text-white shadow-[0_10px_30px_-10px_rgb(42_171_238/0.9)]">
          <PlaneIcon className="h-6 w-6" />
        </span>
        <h2 id="tg-pay-title" className="mt-3 font-display text-xl font-bold text-neutral-50">Pay with Telegram</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {what} · <b className="tabular-nums text-neutral-100">⭐ {stars.toLocaleString()}</b>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          Telegram opens with the payment. Short on Stars? Telegram sells them right there with a card, Apple Pay or Google Pay. Works best in the Telegram app
          on your phone.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#37aee2] to-[#1e96c8] px-5 py-3 font-semibold text-white shadow-[0_10px_24px_-10px_rgb(42_171_238/0.8)] transition hover:brightness-110 disabled:opacity-60"
        >
          <PlaneIcon className="h-4 w-4" /> {busy ? "Opening Telegram..." : "Continue to payment"}
        </button>
        <Link href={TELEGRAM_GUIDE_PATH} target="_blank" className="mt-3 inline-block text-sm font-semibold text-[#7cc9f0] underline-offset-4 hover:underline">
          How to pay with Telegram (guide)
        </Link>
      </div>
    </div>
  );
}
