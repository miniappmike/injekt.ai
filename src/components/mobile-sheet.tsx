"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * On a phone, its contents slide up as a bottom sheet over the page (opened by a button elsewhere); from the small
 * breakpoint up they sit in the page as usual. One copy of the contents either way, so nothing typed is lost.
 */
export function MobileSheet({ open, onClose, title, className, children }: { open: boolean; onClose: () => void; title: string; className?: string; children: React.ReactNode }) {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    // The page behind stays put while the sheet is up (only matters on phones, where it covers the page).
    // The dock steps aside too (see MobileDock).
    const before = document.body.style.overflow;
    if (matchMedia("(max-width: 639px)").matches) document.body.style.overflow = "hidden";
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = before;
      document.documentElement.classList.remove("sheet-open");
    };
  }, [open, onClose]);
  const sheet = (
    <div className={cn("max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:flex max-sm:flex-col max-sm:justify-end", !open && "max-sm:hidden")}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px] sm:hidden" />
      <section
        role={open ? "dialog" : undefined}
        aria-label={title}
        className={cn(
          className,
          "max-sm:relative max-sm:max-h-[86dvh] max-sm:animate-sheet-up max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-neutral-900 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-1 flex flex-col items-center gap-2 bg-neutral-900/95 px-4 pb-2 pt-2.5 backdrop-blur sm:hidden">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-neutral-700" />
          <div className="flex w-full items-center justify-between">
            <span className="font-display text-lg font-bold text-neutral-50">{title}</span>
            <button type="button" onClick={onClose} className="h-9 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white active:scale-95">Done</button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
  // Open on a phone, it's drawn on the page body, so nothing on the page (a transform, a clip) can box it in.
  return open && phone ? createPortal(sheet, document.body) : sheet;
}
