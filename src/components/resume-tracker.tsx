"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LAST_PAGE_COOKIE, LAST_PAGE_HOURS, resumablePath } from "@/lib/resume";

const SCROLL_KEY = "ms.lastScroll";

/** Keeps the cookie the proxy reads when the home-screen app is opened again (see `src/lib/resume.ts`). */
function rememberPage() {
  const page = location.pathname + location.search;
  if (!resumablePath(encodeURIComponent(page))) return;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LAST_PAGE_COOKIE}=${encodeURIComponent(page)}; path=/; max-age=${LAST_PAGE_HOURS * 3600}; samesite=lax${secure}`;
}

function rememberScroll() {
  try {
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ page: location.pathname + location.search, y: Math.round(window.scrollY), at: Date.now() }));
  } catch {
    // Private window: the page just opens at the top.
  }
}

/**
 * Remembers the page you're on and how far down it you were, each time you change page or leave the app. When the
 * phone has closed the app in the background and it starts again, the proxy opens that page and this scrolls it back
 * to the same spot. Draws nothing.
 */
export function ResumeTracker() {
  const pathname = usePathname();

  useEffect(() => {
    rememberPage();
  }, [pathname]);

  useEffect(() => {
    // A fresh start on the page we left: go back down to where we were. The browser already does this itself for a
    // reload and for Back, so those are left alone.
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const saved = JSON.parse(localStorage.getItem(SCROLL_KEY) || "null") as { page: string; y: number; at: number } | null;
      const fresh = !nav || nav.type === "navigate";
      if (fresh && saved && saved.y > 0 && saved.page === location.pathname + location.search && Date.now() - saved.at < LAST_PAGE_HOURS * 3_600_000) {
        // The page may still be filling in, so keep trying for a moment until it is tall enough.
        let tries = 0;
        const go = () => {
          if (window.scrollY > 0) return;
          if (document.documentElement.scrollHeight - window.innerHeight >= saved.y || tries > 20) window.scrollTo(0, saved.y);
          else if (tries++ <= 20) setTimeout(go, 100);
        };
        go();
      }
    } catch {
      // Nothing saved, or storage is off.
    }
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      rememberPage();
      rememberScroll();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", rememberScroll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", rememberScroll);
    };
  }, []);

  return null;
}
