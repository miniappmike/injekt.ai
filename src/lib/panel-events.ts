export const OPEN_HISTORY_EVENT = "modelspawn:open-history";
export type HistoryTab = "prompts" | "images";

/** Opens the History panel from anywhere in the app, on the given tab. */
export function openHistory(tab: HistoryTab = "prompts") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_HISTORY_EVENT, { detail: { tab } }));
}
