"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GuidePhase } from "@/lib/key-guide";
import { cn } from "@/lib/utils";
import { Shot, StepBody, Where } from "./parts";

/** Every step with its number across the whole guide, and its phase. */
export const numberSteps = (phases: GuidePhase[]) => phases.flatMap((phase, p) => phase.steps.map((step) => ({ step, phase: p }))).map((s, i) => ({ ...s, n: i + 1 }));

/** The guide: one step at a time with a big screenshot, Back and Next, and a checklist that remembers progress. */
export function GuideStepper({ phases, storageKey, hero, footer }: { phases: GuidePhase[]; /** Where progress is remembered in the browser. */ storageKey: string; hero: ReactNode; footer: ReactNode }) {
  const STEPS = useMemo(() => numberSteps(phases), [phases]);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      setDone(new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]")));
    } catch {
      // Private window: progress lasts for this visit.
    }
  }, [storageKey]);
  const save = (next: Set<number>) => {
    setDone(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // As above.
    }
  };
  const go = (i: number) => {
    setAt(Math.max(0, Math.min(STEPS.length - 1, i)));
    document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const next = () => {
    save(new Set(done).add(STEPS[at].n));
    go(at + 1);
  };
  // The last step: tick it and scroll down to "You're all set".
  const finish = () => {
    save(new Set(done).add(STEPS[at].n));
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
  };
  const s = STEPS[at];
  const pct = Math.round((done.size / STEPS.length) * 100);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {hero}
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="panel flex flex-col gap-3 p-4 lg:sticky lg:top-28">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-neutral-100">Your progress</p>
              <p className="text-xs tabular-nums text-neutral-400">{done.size}/{STEPS.length}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-iris-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ol className="flex flex-col gap-0.5 max-lg:hidden">
            {STEPS.map((x, i) => (
              <li key={x.n}>
                {(i === 0 || STEPS[i - 1].phase !== x.phase) && (
                  <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500 first:mt-0">{phases[x.phase].title}</p>
                )}
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors", i === at ? "bg-brand-500/15 text-neutral-50" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100")}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", done.has(x.n) ? "bg-emerald-500 text-white" : i === at ? "bg-brand-500 text-white" : "bg-neutral-800 text-neutral-400")}>
                    {done.has(x.n) ? "✓" : x.n}
                  </span>
                  <span className="truncate">{x.step.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section id="stage" aria-live="polite" className="panel flex scroll-mt-28 flex-col gap-5 overflow-hidden p-6 max-sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-400">
              Step <b className="font-display text-neutral-50">{s.n}</b> of {STEPS.length} · {phases[s.phase].title}
            </p>
            <Where where={s.step.where} />
          </div>
          <h2 key={`t${s.n}`} className="animate-fade-up font-display text-3xl font-extrabold text-neutral-50 max-sm:text-2xl">{s.step.title}</h2>
          <div key={`b${s.n}`} className="animate-fade-up"><StepBody step={s.step} /></div>
          {s.step.shots && (
            <div key={`s${s.n}`} className={cn("grid animate-fade-up items-start gap-3", s.step.shots.length > 1 && "md:grid-cols-2")}>
              {s.step.shots.map((x) => (
                <Shot key={x.src} shot={x} className={cn(x.height > x.width && s.step.shots!.length === 1 && "mx-auto max-w-md")} />
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-neutral-800 pt-4">
            <button type="button" onClick={() => go(at - 1)} disabled={at === 0} className="h-10 rounded-lg px-4 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-30">
              ← Back
            </button>
            <div className="flex gap-1 max-sm:hidden" aria-hidden="true">
              {STEPS.map((x, i) => (
                <span key={x.n} className={cn("h-1.5 rounded-full transition-all", i === at ? "w-5 bg-brand-500" : done.has(x.n) ? "w-1.5 bg-emerald-500" : "w-1.5 bg-neutral-700")} />
              ))}
            </div>
            {at < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="glow-brand h-10 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-400 active:scale-95">
                Done, next →
              </button>
            ) : (
              <button type="button" onClick={finish} className="h-10 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 active:scale-95">
                Finish ✓
              </button>
            )}
          </div>
        </section>
      </div>
      {footer}
    </div>
  );
}
