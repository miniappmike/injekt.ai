/** A numbered step heading ("1 Add your images"), so a page reads as a short recipe. */
export function Step({ n, title, hint, aside }: { n: number; title: string; hint?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 font-display text-xs font-bold text-white shadow-[0_3px_10px_-3px_rgb(232_38_94/0.8)]"
        >
          {n}
        </span>
        <div>
          <p className="font-display text-[15px] font-bold leading-6 text-neutral-50">{title}</p>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}
