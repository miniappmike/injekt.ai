"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ScrollQuillIcon } from "@/components/icons";
import { OPEN_HISTORY_EVENT, type HistoryTab } from "@/lib/panel-events";

/**
 * History lives in the Library now (its Prompts tab; the Images tab is every active image). This keeps the floating
 * History button on wider screens, and makes everything that used to open the History panel (openHistory, the phone's
 * History button, "All images") go to the Library instead.
 */
export function HistoryLauncher() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: HistoryTab }>).detail?.tab;
      router.push(tab === "images" ? "/library" : "/library?tab=prompts");
    };
    window.addEventListener(OPEN_HISTORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HISTORY_EVENT, onOpen);
  }, [router]);
  if (!mounted) return null;
  // Drawn on the page body so no transformed parent can move it off the screen. Above the image tray (it sets --tray-h).
  return createPortal(
    <button
      type="button"
      onClick={() => router.push("/library?tab=prompts")}
      aria-label="History"
      title="History"
      className="group fixed bottom-[calc(var(--tray-h,0px)+1.5rem)] right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_12px_32px_-10px_rgb(232_38_94/0.85),0_4px_12px_-4px_rgb(0_0_0/0.7)] ring-1 ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_16px_40px_-10px_rgb(232_38_94/0.95),0_4px_12px_-4px_rgb(0_0_0/0.7)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:scale-95 max-sm:hidden [.sheet-open_&]:pointer-events-none [.sheet-open_&]:scale-75 [.sheet-open_&]:opacity-0"
    >
      <ScrollQuillIcon className="h-7 w-7 transition-transform duration-200 group-hover:-rotate-6" />
    </button>,
    document.body,
  );
}
