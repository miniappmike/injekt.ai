export const OPEN_HISTORY_EVENT = "modelspawn:open-history";
export type HistoryTab = "prompts" | "images";

/** Opens the History panel from anywhere in the app, on the given tab. */
export function openHistory(tab: HistoryTab = "prompts") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_HISTORY_EVENT, { detail: { tab } }));
}

export const VIEW_IMAGE_EVENT = "modelspawn:view-image";
export interface ViewableImage {
  url: string;
  downloadUrl?: string | null;
  prompt?: string | null;
  title?: string;
}

/** Opens the full-screen image viewer from anywhere in the app. */
export function viewImage(image: ViewableImage) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(VIEW_IMAGE_EVENT, { detail: image }));
}

export const GENERATION_EVENT = "modelspawn:generation";
export interface TrayGeneration {
  /** One per press of a Generate button. */
  key: string;
  label: string;
  prompt: string;
  state: "generating" | "ready" | "failed";
  url?: string;
  downloadUrl?: string;
  error?: string;
}

/** Tells the bottom tray about a generation started on this page, or about its result. */
export function reportGeneration(update: TrayGeneration) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GENERATION_EVENT, { detail: update }));
}
