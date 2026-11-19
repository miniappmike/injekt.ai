import { useId } from "react";
import { MARK } from "@/lib/brand-mark";

/** The ModelSpawn mark (the pink "m" ribbon) and the wordmark in the display font. */
export { MARK };

export function Logo({ withName = true, small = false }: { withName?: boolean; small?: boolean }) {
  // Its own gradient id per logo. Several are on a page (top bar, footer), and a mark whose gradient lives in a hidden
  // copy draws as nothing: that is how the footer's mark went missing on phones.
  const gid = `ms-mark-${useId().replace(/:/g, "")}`;
  return (
    <span className="group inline-flex items-center gap-2">
      <svg viewBox="255 655 1540 760" aria-hidden="true" className={`${small ? "h-[18px]" : "h-7"} w-auto drop-shadow-[0_4px_12px_rgb(249_39_118/0.5)] transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-110`}>
        <defs>
          <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx="1000" cy="965" r="1" gradientTransform="translate(1000 965) rotate(-12) scale(820 400) translate(-1000 -965)">
          <stop offset="0" stopColor="#ff8fc0" />
          <stop offset="0.45" stopColor="#ff5fa2" />
          <stop offset="0.8" stopColor="#fb3a82" />
          <stop offset="1" stopColor="#f92776" />
          </radialGradient>
        </defs>
        <path d={MARK} fill={`url(#${gid})`} />
      </svg>
      {withName && <span className="font-display text-lg font-bold tracking-tight text-neutral-50">ModelSpawn</span>}
    </span>
  );
}
