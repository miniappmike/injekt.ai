import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Pro gem: a glossy rounded square with a four-point sparkle, in the logo's pink (the "M" mark's gradient: light in the
 * middle, deep at the edges).
 */
export function ProGem({ className, glow = true }: { className?: string; glow?: boolean }) {
  // Its own gradient ids, so a hidden copy elsewhere on the page can't blank this one.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("h-8 w-8 shrink-0", glow && "drop-shadow-[0_0_16px_rgb(249_39_118/0.6)]", className)}>
      <defs>
        <radialGradient id={`${id}f`} cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#ff8fc0" />
          <stop offset="0.45" stopColor="#ff5fa2" />
          <stop offset="0.8" stopColor="#fb3a82" />
          <stop offset="1" stopColor="#f92776" />
        </radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id}f)`} />
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id}s)`} />
      <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="15.25" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M32 14c1.6 9.6 6.4 14.4 16 16-9.6 1.6-14.4 6.4-16 16-1.6-9.6-6.4-14.4-16-16 9.6-1.6 14.4-6.4 16-16Z" fill="#fff" />
    </svg>
  );
}

/** "Pro" in the brand's pink gradient. */
export function ProWord({ className }: { className?: string }) {
  return (
    <span className={cn("bg-gradient-to-br from-[#ff8fc0] via-[#ff5fa2] to-[#f92776] bg-clip-text font-display font-black italic text-transparent", className)}>
      Pro
    </span>
  );
}

/** A small "PRO" tag for things that need Pro. */
export function ProBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-300 ring-1 ring-brand-400/40", className)}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
        <path d="M8 1c.5 3.3 2.2 5 5.5 5.5C10.2 7 8.5 8.7 8 12c-.5-3.3-2.2-5-5.5-5.5C5.8 6 7.5 4.3 8 1Z" />
      </svg>
      Pro
    </span>
  );
}
