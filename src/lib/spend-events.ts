export const SPEND_EVENT = "modelspawn:spend";

/** Tells the spend meter and cost hints that something was just spent, so they refresh right away. Safe to call anywhere in the browser. */
export function notifySpend() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SPEND_EVENT));
}
