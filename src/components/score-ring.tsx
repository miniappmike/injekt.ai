/** A score as a ring that fills to it: green from 85, amber from 70, crimson below. It sweeps in when shown. */
export function ScoreRing({ score, max = 100, size = 96 }: { score: number; max?: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, score / max));
  const tone = f >= 0.85 ? "#34d399" : f >= 0.7 ? "#fbbf24" : "#f7487a";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-neutral-800" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          style={{ filter: `drop-shadow(0 0 6px ${tone}99)`, transition: "stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)", animation: "ring-sweep 0.9s cubic-bezier(.2,.8,.2,1) both", ["--ring-from" as string]: c }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-3xl font-extrabold text-neutral-50">{score}</span>
    </div>
  );
}

/** A thin bar for a score out of 10, in the same colours as the ring. */
export function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const f = Math.max(0, Math.min(1, score / max));
  const tone = f >= 0.9 ? "from-emerald-400 to-emerald-300" : f >= 0.7 ? "from-amber-400 to-amber-300" : "from-brand-500 to-brand-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800" aria-hidden="true">
      <div className={`h-full origin-left animate-[bar-grow_0.7s_cubic-bezier(.2,.8,.2,1)_both] rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${f * 100}%` }} />
    </div>
  );
}
