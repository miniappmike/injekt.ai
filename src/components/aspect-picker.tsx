"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { IMAGE_ASPECT_RATIOS, type ImageAspectRatio } from "@/lib/ai/providers/types";
import { cn } from "@/lib/utils";

/** A short name for each shape, shown beside the ratio. */
const NAMES: Record<ImageAspectRatio, string> = {
  "1:1": "Square",
  "16:9": "Widescreen",
  "9:16": "Story",
  "4:3": "Classic",
  "3:4": "Portrait",
  "3:2": "Standard",
  "2:3": "Tall",
  "21:9": "Cinematic",
};
/** The order in the list: square, then each landscape shape followed by its portrait twin. */
const ORDER: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
const RATIOS = ORDER.filter((r) => (IMAGE_ASPECT_RATIOS as readonly string[]).includes(r));

/** A small outline of the shape, fitted in a 16 by 16 box. */
export function AspectIcon({ ratio, className }: { ratio: ImageAspectRatio; className?: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 14 / Math.max(w, h);
  const bw = Math.max(4, w * scale);
  const bh = Math.max(4, h * scale);
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("h-4 w-4 shrink-0", className)}>
      <rect x={(16 - bw) / 2} y={(16 - bh) / 2} width={bw} height={bh} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The image shape picker: a button showing the chosen shape, opening a list of every shape with a preview of it.
 * On a computer the list drops down under the button; on a phone it is a sheet from the bottom of the screen.
 */
export function AspectPicker({ value, onChange, className }: { value: ImageAspectRatio; onChange: (v: ImageAspectRatio) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, RATIOS.indexOf(value)));
  const [phone, setPhone] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, RATIOS.indexOf(value)));
    requestAnimationFrame(() => list.current?.focus());
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    // On a phone the page behind the sheet stays put.
    const before = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", away);
      document.body.style.overflow = before;
    };
  }, [open, phone, value]);

  const pick = (r: ImageAspectRatio) => {
    onChange(r);
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % RATIOS.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + RATIOS.length) % RATIOS.length));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(RATIOS.length - 1));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), pick(RATIOS[active]));
    else if (e.key === "Escape" || e.key === "Tab") (e.key === "Escape" && e.preventDefault(), setOpen(false), button.current?.focus());
  };

  const options = (
    <ul
      ref={list}
      id={id}
      role="listbox"
      tabIndex={-1}
      aria-label="Image shape"
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onKey}
      className="flex flex-col gap-0.5 focus:outline-none"
    >
      {RATIOS.map((r, i) => (
        <li
          key={r}
          id={`${id}-${i}`}
          role="option"
          aria-selected={r === value}
          onPointerEnter={() => setActive(i)}
          onClick={() => pick(r)}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm max-sm:py-3 sm:py-1.5",
            i === active ? "bg-neutral-700/60" : "max-sm:active:bg-neutral-800",
          )}
        >
          <AspectIcon ratio={r} className={r === value ? "text-brand-400" : "text-neutral-300"} />
          <span className="w-10 font-semibold tabular-nums text-neutral-100">{r}</span>
          <span className="text-neutral-400">{NAMES[r]}</span>
          {r === value && (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="ml-auto h-4 w-4 text-brand-400">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Image shape: ${value} ${NAMES[value]}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") (e.preventDefault(), setOpen(true));
        }}
        className="flex h-8 items-center gap-2 rounded-lg border border-neutral-700/80 bg-neutral-950/60 pl-2 pr-1.5 text-sm text-neutral-100 transition-colors hover:border-neutral-600 max-sm:h-10"
      >
        <AspectIcon ratio={value} className="text-neutral-300" />
        <span className="tabular-nums">{value}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("h-3.5 w-3.5 text-neutral-400 transition-transform", open && "rotate-180")}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && !phone && (
        <div className="absolute bottom-full left-0 z-40 mb-1.5 w-56 rounded-xl border border-neutral-700/80 bg-neutral-900 p-1 shadow-xl shadow-black/50">{options}</div>
      )}
      {open &&
        phone &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px]" />
            <section role="dialog" aria-label="Image shape" className="relative animate-sheet-up rounded-t-[1.75rem] bg-neutral-900 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5">
              <div className="mb-2 flex justify-center">
                <span className="h-1 w-10 rounded-full bg-neutral-700" />
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-lg font-bold text-neutral-50">Image shape</span>
                <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white active:scale-95">
                  Done
                </button>
              </div>
              {options}
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
