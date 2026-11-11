import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The token: a glossy rounded square with a rounded square cut out, lit from the top left like the "M" mark.
 * `tone="solid"` draws it in the current text colour, for pink buttons (pass the page background colour there, so it
 * reads as a cut-out instead of pink on pink).
 */
export function TokenIcon({ className, tone = "brand" }: { className?: string; tone?: "brand" | "solid" }) {
  const id = useId().replace(/:/g, "");
  // Outer square, and the hole, as one even-odd shape so the hole is truly see-through.
  const ring = "M30 4h40a26 26 0 0 1 26 26v40a26 26 0 0 1-26 26H30A26 26 0 0 1 4 70V30A26 26 0 0 1 30 4Z";
  const hole = "M45 31h10a14 14 0 0 1 14 14v10a14 14 0 0 1-14 14H45a14 14 0 0 1-14-14V45a14 14 0 0 1 14-14Z";
  const bevel = "M41 19h18a22 22 0 0 1 22 22v18a22 22 0 0 1-22 22H41a22 22 0 0 1-22-22V41a22 22 0 0 1 22-22Z";
  if (tone === "solid") {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("h-4 w-4 shrink-0", className)}>
        <path d={ring + hole} fill="currentColor" fillRule="evenodd" />
        <path d={bevel + hole} fill="currentColor" fillRule="evenodd" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("h-4 w-4 shrink-0", className)}>
      <defs>
        <radialGradient id={`${id}o`} cx="22%" cy="18%" r="95%">
          <stop offset="0" stopColor="#ff9fd0" />
          <stop offset="0.35" stopColor="#ff4f9a" />
          <stop offset="0.7" stopColor="#f9136f" />
          <stop offset="1" stopColor="#b80a4e" />
        </radialGradient>
        <linearGradient id={`${id}b`} x1="0.15" y1="0.1" x2="0.9" y2="0.95">
          <stop offset="0" stopColor="#a8063f" />
          <stop offset="0.45" stopColor="#e5157a" />
          <stop offset="0.6" stopColor="#ff4f9a" />
          <stop offset="1" stopColor="#7d0636" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="1" x2="0.6" y2="0.4">
          <stop offset="0" stopColor="#ffb3dc" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#ffb3dc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={ring + hole} fill={`url(#${id}o)`} fillRule="evenodd" />
      <path d={bevel + hole} fill={`url(#${id}b)`} fillRule="evenodd" />
      <path d={bevel + hole} fill={`url(#${id}h)`} fillRule="evenodd" />
    </svg>
  );
}

/** "N" with the token, for the end of a button label. On a pink button the token is drawn in the page's background colour. */
export function TokenCost({ n, onPink = false }: { n: number; onPink?: boolean }) {
  return (
    <span aria-label={`${n} tokens`} className={cn("ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums", onPink ? "" : "bg-neutral-950/40")}>
      {onPink ? <TokenIcon tone="solid" className="h-4 w-4 text-neutral-950" /> : <TokenIcon className="h-3.5 w-3.5" />}
      {n}
    </span>
  );
}
