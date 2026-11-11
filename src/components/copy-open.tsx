"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GENERATOR } from "@/lib/links";

/**
 * The main action on a finished prompt: copies it and opens the generator in a new tab, so pasting is the only step
 * left. A plain "Copy" sits beside it for people who use another generator.
 */
export function CopyOpen({ text, disabled, className }: { text: string; disabled?: boolean; className?: string }) {
  const [done, setDone] = useState<"copy" | "open" | null>(null);
  const copy = async (open: boolean) => {
    // Opened first, while the click still counts as the person's own action (pop-up blockers).
    if (open) window.open(GENERATOR.url, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked; the text is still on the page to select.
    }
    setDone(open ? "open" : "copy");
    setTimeout(() => setDone(null), 2000);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void copy(true)}
        className="glow-brand inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white transition-all hover:bg-brand-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
        </svg>
        {done === "open" ? "Copied, paste it there" : `Copy & open ${GENERATOR.name}`}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void copy(false)}
        className="inline-flex h-8 items-center rounded-lg border border-neutral-700 bg-neutral-800/70 px-3 text-xs font-semibold text-neutral-200 transition-all hover:border-neutral-600 hover:bg-neutral-800 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        {done === "copy" ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
