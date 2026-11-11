/**
 * Generations started in this browser tab, kept in sessionStorage so a page that the phone reloaded (switching apps on
 * iOS can do that) still shows the image once it's ready. The Generate panel that started a job picks it back up, and
 * so does the tray along the bottom of the page. Entries are dropped after 30 minutes.
 */
const KEY = "ms.pendingGenerations";
const MAX_AGE_MS = 30 * 60_000;

export interface PendingGeneration {
  generationId: string;
  /** The tray item's key. */
  key: string;
  /** Which Generate panel started it: a hash of everything it sent. */
  request: string;
  path: string;
  label: string;
  prompt: string;
  startedAt: number;
}

function read(): PendingGeneration[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as PendingGeneration[];
    return Array.isArray(list) ? list.filter((p) => Date.now() - p.startedAt < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}
function write(list: PendingGeneration[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    // Private window or full storage: the page just won't remember it across a reload.
  }
}

export const rememberGeneration = (p: PendingGeneration) => write([...read().filter((x) => x.generationId !== p.generationId), p]);
export const forgetGeneration = (generationId: string) => write(read().filter((x) => x.generationId !== generationId));
export const generationsOnPage = (path: string) => read().filter((p) => p.path === path);
/** The newest job a Generate panel with this request started. */
export const latestForRequest = (request: string) =>
  read()
    .filter((p) => p.request === request)
    .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;

/** A short, stable fingerprint of a request (the prompt can be thousands of characters). */
export function requestHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Waits `ms`, or less: it resolves as soon as the page comes back into view (back to the tab or the app), so a job
 * that finished in the background shows up at once. While the page is hidden it simply waits for it to return.
 */
export function waitOrWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", finish);
      window.removeEventListener("online", finish);
      resolve();
    };
    const onVisible = () => document.visibilityState === "visible" && finish();
    const timer = setTimeout(() => (document.visibilityState === "visible" ? finish() : undefined), ms);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", finish);
    window.addEventListener("online", finish);
  });
}
