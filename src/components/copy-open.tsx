"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { GENERATION_SETTINGS_PATH, GET_KEY_PATH } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * Under a finished prompt: Copy prompt, and (while image generation is off) a greyed-out Generate image button whose
 * card says how to turn it on: buy credits, get an API key, or switch image generation on in Settings. With
 * generation on, pages show the real Generate controls instead.
 */
export function CopyOpen({ text, disabled, className }: { text: string; disabled?: boolean; className?: string }) {
  const { generation } = useApp();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked; the text is still on the page to select.
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void copy()}
        className="glow-brand inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white transition-all hover:bg-brand-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        </svg>
        {done ? "Copied" : "Copy prompt"}
      </button>
      {!generation && <LockedGenerate />}
    </div>
  );
}

/**
 * A greyed-out Generate image button. Hovering, focusing or tapping it opens a small card with the three ways to
 * generate: buy credits (coming soon), get an API key, or turn on image generation.
 */
export function LockedGenerate({ label = "Generate image", size = "sm" }: { label?: string; size?: "sm" | "xs" }) {
  const { imageKey } = useApp();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short delay, so the pointer can travel from the button to the card.
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const row = "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors";
  return (
    <div ref={root} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={(e) => !root.current?.contains(e.relatedTarget as Node) && hide()}>
      <button
        type="button"
        aria-disabled="true"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 font-semibold text-neutral-500",
          size === "sm" ? "h-8 px-3 text-xs" : "h-7 px-2.5 text-[11px]",
        )}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="9" width="11" height="8" rx="2" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </svg>
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Turn on image generation"
          className="absolute bottom-full left-0 z-40 mb-2 w-72 animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900/95 p-2 text-sm shadow-[0_20px_50px_-15px_rgb(0_0_0/0.9)] backdrop-blur-xl max-sm:fixed max-sm:inset-x-4 max-sm:bottom-24 max-sm:w-auto max-sm:bg-neutral-900"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs text-neutral-400">Generate images right here, with any of these:</p>
          <div className={cn(row, "cursor-default opacity-60")} aria-disabled="true">
            <span aria-hidden="true" className="mt-0.5 text-base leading-none">🪙</span>
            <span>
              <span className="font-semibold text-neutral-100">Buy credits</span>{" "}
              <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">Coming soon</span>
              <span className="block text-xs text-neutral-500">Pay as you go, no key needed.</span>
            </span>
          </div>
          {/* Only until they have a key; after that the guide stays in the footer. */}
          {!imageKey && (
            <Link href={GET_KEY_PATH} onClick={() => setOpen(false)} className={cn(row, "hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none")}>
              <span aria-hidden="true" className="mt-0.5 text-base leading-none">🔑</span>
              <span>
                <span className="font-semibold text-neutral-100">Get an API key</span>
                <span className="block text-xs text-neutral-500">Your own SpicyAPI key. Takes a few minutes.</span>
              </span>
            </Link>
          )}
          <Link href={GENERATION_SETTINGS_PATH} onClick={() => setOpen(false)} className={cn(row, "hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none")}>
            <span aria-hidden="true" className="mt-0.5 text-base leading-none">⚡</span>
            <span>
              <span className="font-semibold text-neutral-100">Turn on image generation</span>
              <span className="block text-xs text-neutral-500">{imageKey ? "You have a key: switch it on in Settings." : "In Settings, once your key is added."}</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
