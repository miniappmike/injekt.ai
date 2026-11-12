"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** A small "Copy" button, for an email or ID in Admin. */
export function AdminCopy({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked; the text is still on the page to select.
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn("rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 active:scale-95", className)}
    >
      {done ? "Copied" : label}
    </button>
  );
}
