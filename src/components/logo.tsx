/** The Model Spawn mark: a crimson peak with a notch, and the wordmark in the display font. */
export function Logo({ withName = true }: { withName?: boolean }) {
  return (
    <span className="group inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-7 w-7 drop-shadow-[0_4px_12px_rgb(232_38_94/0.55)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
        <defs>
          <linearGradient id="ms-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7a9c" />
            <stop offset="0.55" stopColor="#e8265e" />
            <stop offset="1" stopColor="#a21541" />
          </linearGradient>
        </defs>
        <path d="M16 2 30 28H2Z" fill="url(#ms-mark)" />
        <path d="M16 14 21.5 24h-11Z" fill="#131316" />
      </svg>
      {withName && <span className="font-display text-lg font-bold tracking-tight text-neutral-50">Model Spawn</span>}
    </span>
  );
}
