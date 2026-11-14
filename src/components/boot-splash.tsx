"use client";

import { useEffect, useState } from "react";
import { MARK } from "@/components/logo";

/** The flashing M on a dim backdrop: the look of every loading screen. `fixed` covers the whole window. */
export function LoadingMark({ className = "" }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`flex items-center justify-center bg-[#12030a]/80 backdrop-blur-sm ${className}`}>
      <svg viewBox="255 655 1540 760" aria-hidden="true" className="splash-m h-14 w-auto drop-shadow-[0_6px_24px_rgb(249_39_118/0.6)]">
        <defs>
          <radialGradient id="ms-splash" gradientUnits="userSpaceOnUse" cx="1000" cy="965" r="1" gradientTransform="translate(1000 965) rotate(-12) scale(820 400) translate(-1000 -965)">
            <stop offset="0" stopColor="#ff8fc0" />
            <stop offset="0.45" stopColor="#ff5fa2" />
            <stop offset="0.8" stopColor="#fb3a82" />
            <stop offset="1" stopColor="#f92776" />
          </radialGradient>
        </defs>
        <path d={MARK} fill="url(#ms-splash)" />
      </svg>
    </div>
  );
}

/**
 * Covers the page from the first moment the HTML arrives (so opening the app from the home screen shows the logo, not
 * a black screen) and fades away once the page is ready. It is plain markup until then, so it shows before any script
 * has loaded; a CSS timer removes it anyway if the script never runs.
 */
export function BootSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    setPhase("fade");
    const t = setTimeout(() => setPhase("gone"), 450);
    return () => clearTimeout(t);
  }, []);
  if (phase === "gone") return null;
  return <LoadingMark className={`boot-splash fixed inset-0 z-[200] transition-opacity duration-500 ${phase === "fade" ? "pointer-events-none opacity-0" : ""}`} />;
}
