"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useGeneration } from "@/components/app-context";
import { MODEL_ID_RE, MODEL_REFUSED_EVENT, usePageModel, type ModelRefused } from "@/lib/page-model";
import { cn } from "@/lib/utils";

/** Pages whose Generate buttons get the box at the bottom. Characters gets it inside the group photo panel instead. */
const GENERATION_PAGES = [/^\/inject/, /^\/variants/, /^\/likeness/, /^\/reference-sheet/, /^\/art-to-real/];

/** Whether the box is open, remembered in this browser and shared by every page. */
const OPEN_KEY = "ms.pageModelOpen";
const OPEN_EVENT = "ms:page-model-open";
function useBoxOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      // Private window: starts closed.
    }
    const on = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      // As above.
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: v }));
  };
  return [open, set];
}

/** At the bottom of each generation page (not Characters, whose group photo panel has its own). */
export function PageModelBox() {
  const generation = useGeneration();
  const path = usePathname();
  if (!generation || !GENERATION_PAGES.some((re) => re.test(path))) return null;
  return (
    <section className="mx-auto mb-10 max-w-6xl px-4 sm:px-6 2xl:max-w-[88rem]">
      <ModelBox />
    </section>
  );
}

/**
 * A model ID to use for this page's images instead of the one in Settings, just this once. Collapsible; open or
 * closed is remembered across pages. Clearing it goes back to the Settings model.
 */
export function ModelBox({ compact = false }: { compact?: boolean }) {
  const [value, setValue] = usePageModel();
  const [open, setOpen] = useBoxOpen();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const v = draft.trim();
  const bad = !!v && !MODEL_ID_RE.test(v);
  const active = !!value.trim();
  return (
    <div className={cn("rounded-2xl border transition-colors", compact ? "p-3" : "p-4", active ? "border-iris-500/50 bg-iris-500/[0.06]" : "border-neutral-800 bg-neutral-900/50")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className={cn("flex items-center gap-2 font-display font-bold text-neutral-50", compact ? "text-sm" : "text-base")}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("h-4 w-4 shrink-0 fill-none stroke-current text-neutral-400 transition-transform", open && "rotate-90")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 5 5 5-5 5" /></svg>
          Image model for this page <span className="text-sm font-normal text-neutral-500">(optional)</span>
        </span>
        {active && <span className="rounded-full bg-iris-500/15 px-2 py-0.5 text-xs font-semibold text-iris-300 ring-1 ring-iris-500/40">Using {value}</span>}
      </button>
      {open && (
        <div className="animate-fade-in">
          <p className="mt-2 text-sm text-neutral-400">
            Paste a SpicyAPI model ID to make this page&apos;s images with it, just this once. Clear it to go back to your model in{" "}
            <Link href="/settings/api-keys" className="underline underline-offset-4 hover:text-neutral-200">Settings</Link>.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!bad) setValue(v);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !bad && v !== value && setValue(v)}
              placeholder="e.g. bytedance/seedream-5.5/edit"
              aria-label="Image model ID for this page"
              aria-invalid={bad}
              spellCheck={false}
              autoCapitalize="off"
              className={cn(
                "h-10 min-w-0 flex-1 rounded-lg border bg-neutral-950/60 px-3 font-mono text-sm text-neutral-100 placeholder:font-sans placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-3",
                bad ? "border-red-500/70 focus-visible:ring-red-500/25" : "border-neutral-700/80 focus-visible:border-brand-500 focus-visible:ring-brand-500/25",
              )}
            />
            <button type="submit" disabled={bad || v === value} className="h-10 rounded-lg bg-neutral-100 px-4 text-sm font-semibold text-neutral-900 transition-opacity disabled:opacity-40">
              Use it
            </button>
            {(active || draft) && (
              <button type="button" onClick={() => { setDraft(""); setValue(""); }} className="h-10 rounded-lg px-3 text-sm font-semibold text-neutral-300 hover:bg-neutral-800">
                Clear
              </button>
            )}
          </form>
          {bad && <p role="alert" className="mt-2 text-xs text-red-400">That doesn&apos;t look like a model ID. It looks like bytedance/seedream-5.5/edit.</p>}
        </div>
      )}
    </div>
  );
}

/** A big, persistent notice when SpicyAPI refuses the image model. Stays until closed. */
export function ModelRefusedToast() {
  const [refused, setRefused] = useState<ModelRefused | null>(null);
  useEffect(() => {
    const on = (e: Event) => setRefused((e as CustomEvent<ModelRefused>).detail);
    window.addEventListener(MODEL_REFUSED_EVENT, on);
    return () => window.removeEventListener(MODEL_REFUSED_EVENT, on);
  }, []);
  if (!refused) return null;
  const notAllowed = refused.reason === "model_not_allowed";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-4 max-sm:bottom-24">
      <div
        role="alert"
        className="pointer-events-auto relative w-full max-w-lg animate-pop-in overflow-hidden rounded-2xl border border-brand-500/50 bg-neutral-900/95 p-5 pr-12 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.95),0_0_0_1px_rgb(232_38_94/0.2),0_0_60px_-20px_rgb(232_38_94/0.6)] backdrop-blur-xl"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-brand-400 to-iris-500" />
        <button
          type="button"
          onClick={() => setRefused(null)}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5 5 15" /></svg>
        </button>
        <p className="font-display text-2xl font-extrabold text-neutral-50 max-sm:text-xl">{notAllowed ? "Key Doesn't Allow Model" : "Model Not Found"}</p>
        {refused.model && <p className="mt-1 break-all font-mono text-sm text-brand-300">{refused.model}</p>}
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          {notAllowed
            ? "Your SpicyAPI key isn't allowed to use this model. Add it to the key's Allowed models on SpicyAPI, or clear the page's model box to use your default."
            : "SpicyAPI doesn't have a model with this ID. Check the spelling, or clear the page's model box to use your default."}
        </p>
      </div>
    </div>
  );
}
