/**
 * Coming back to where you were. A phone closes a home-screen app that has been in the background for a while, and
 * opening it again starts from the app's start address. So the browser keeps the last page in a cookie, and the server
 * (`src/proxy.ts`) sends a launch from the home screen straight back to it. No server-only or browser-only code here:
 * the proxy, the manifest and the page all read this file.
 */

/** The home-screen app's start address; the marker tells the proxy this is an app launch, not a visit to the landing page. */
export const PWA_START_URL = "/?source=pwa";
export const PWA_SOURCE = "pwa";

export const LAST_PAGE_COOKIE = "ms_last";
/** How long the last page is remembered. After this, opening the app starts on Home again. */
export const LAST_PAGE_HOURS = 24;

/** Signed-in pages a launch may go back to (Admin is left out on purpose). */
const RESUMABLE = ["/home", "/characters", "/inject", "/director", "/variants", "/library", "/likeness", "/reference-sheet", "/art-to-real", "/tokens", "/upgrade", "/settings", "/ledger", "/marketplace"];

/**
 * The cookie's value as a page on this site, or null. Only a plain path under one of the pages above is accepted, so
 * a tampered cookie can't send anyone to another site.
 */
export function resumablePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v: string;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (v.length > 300 || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return null;
  const path = v.split(/[?#]/)[0];
  return RESUMABLE.some((p) => path === p || path.startsWith(p + "/")) ? v : null;
}
