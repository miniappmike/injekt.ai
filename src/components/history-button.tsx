"use client";

import { ScrollQuillIcon } from "@/components/icons";
import { OPEN_HISTORY_EVENT } from "@/lib/panel-events";

/**
 * History in the phone top bar, as a square button beside the tokens and the profile menu. Wider screens use the
 * floating button (see HistoryPanel); on a phone that one sat on top of whatever scrolled under it.
 */
export function HistoryButton() {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="History"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_HISTORY_EVENT, { detail: { tab: "prompts" } }))}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-brand-300 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:hidden"
    >
      <ScrollQuillIcon className="h-[22px] w-[22px]" />
    </button>
  );
}
