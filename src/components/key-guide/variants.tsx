"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GUIDE_BALANCE_NOTE, GUIDE_PHASES, GUIDE_UPDATED, type GuideStep } from "@/lib/key-guide";
import { GENERATION_SETTINGS_PATH } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Shot, SpicyCta, StepBody, Where } from "./parts";

/** Every step with its number across the whole guide, and its phase. */
const STEPS = GUIDE_PHASES.flatMap((phase, p) => phase.steps.map((step) => ({ step, phase: p }))).map((s, i) => ({ ...s, n: i + 1 }));
const anchor = (n: number) => `step-${n}`;

function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <header className={cn("relative overflow-hidden rounded-3xl border border-neutral-800 bg-[radial-gradient(90%_120%_at_100%_0%,rgb(232_38_94/0.22),transparent_55%),radial-gradient(80%_120%_at_0%_100%,rgb(91_91_246/0.18),transparent_60%),var(--color-neutral-900)]", compact ? "p-6" : "p-8 max-sm:p-5")}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">API key guide</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight text-neutral-50 max-sm:text-3xl">Get your own API key</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-300">
        One SpicyAPI key unlocks image generation here and prompt writing with no daily limit. Setup takes about 5 minutes, and you pay SpicyAPI only for what you use.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SpicyCta disclosure={false} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
          <li>⏱ ~5 minutes</li>
          <li>🔑 {STEPS.length} steps</li>
          <li>💳 Pay as you go</li>
        </ul>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="flex flex-col gap-4">
      <div className="rounded-2xl border border-iris-500/30 bg-iris-500/[0.06] p-5">
        <p className="font-display text-lg font-bold text-neutral-50">Before you generate</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">{GUIDE_BALANCE_NOTE}</p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <p className="font-display text-2xl font-bold text-neutral-50">That&apos;s it. You&apos;re all set.</p>
        <p className="max-w-md text-sm text-neutral-400">Image generation is on and every tool in Model Spawn is yours to use.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/inject" className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-400">Start creating</Link>
          <Link href={GENERATION_SETTINGS_PATH} className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 hover:border-neutral-500">Open Settings</Link>
        </div>
      </div>
      <p className="text-center text-xs text-neutral-500">Last updated {GUIDE_UPDATED}</p>
    </footer>
  );
}

const Shots = ({ step, className }: { step: GuideStep; className?: string }) =>
  step.shots?.length ? (
    <div className={cn("grid items-start gap-3", step.shots.length > 1 && "sm:grid-cols-2", className)}>
      {/* A tall screenshot on its own stays a readable size instead of filling the width. */}
      {step.shots.map((s) => <Shot key={s.src} shot={s} className={cn(step.shots!.length === 1 && s.height > s.width * 0.9 && "max-w-md")} />)}
    </div>
  ) : null;

/* ------------------------------------------------------------------------------------------------------------------ */
/** A: Timeline. One column of steps on a glowing line, with a sticky step list beside it on wide screens. */
export function GuideTimeline() {
  const [active, setActive] = useState(1);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(Number(top.target.id.slice(5)));
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    STEPS.forEach((s) => {
      const el = document.getElementById(anchor(s.n));
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <Hero />
      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Steps" className="max-lg:hidden">
          <ol className="sticky top-28 flex flex-col gap-0.5 border-l border-neutral-800">
            {STEPS.map((s) => (
              <li key={s.n}>
                <a
                  href={`#${anchor(s.n)}`}
                  className={cn(
                    "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors",
                    active === s.n ? "border-brand-500 font-semibold text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-200",
                  )}
                >
                  <span className="tabular-nums text-neutral-600">{String(s.n).padStart(2, "0")}</span> {s.step.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <ol className="relative flex flex-col">
          <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-brand-500 via-iris-500 to-brand-500/10" />
          {STEPS.map((s, i) => {
            const newPhase = i === 0 || STEPS[i - 1].phase !== s.phase;
            return (
              <li key={s.n} id={anchor(s.n)} className="relative scroll-mt-28 pb-12 pl-14 last:pb-0">
                {newPhase && (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Part {s.phase + 1} · {GUIDE_PHASES[s.phase].title}
                  </p>
                )}
                <span className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-950 font-display text-base font-bold text-white ring-2 ring-brand-500 shadow-[0_0_24px_-4px_rgb(232_38_94/0.7)]" style={{ top: newPhase ? "2.1rem" : 0 }}>
                  {s.n}
                </span>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-2xl font-bold text-neutral-50">{s.step.title}</h2>
                    <Where where={s.step.where} />
                  </div>
                  <StepBody step={s.step} />
                  <Shots step={s.step} />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/** B: Chapters. Three parts with big poster numbers; each step is a row with the text beside its screenshot. */
export function GuideChapters() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12">
      <Hero />
      <nav aria-label="Parts" className="grid gap-3 sm:grid-cols-3">
        {GUIDE_PHASES.map((p, i) => (
          <a key={p.title} href={`#part-${i + 1}`} className="group rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-500/40">
            <span className="font-poster text-4xl leading-none text-brand-400">0{i + 1}</span>
            <p className="mt-1 font-display text-base font-bold text-neutral-50">{p.title}</p>
            <p className="text-xs text-neutral-500">{p.blurb} · {p.steps.length} steps</p>
          </a>
        ))}
      </nav>

      {GUIDE_PHASES.map((phase, p) => (
        <section key={phase.title} id={`part-${p + 1}`} className="scroll-mt-28">
          <div className="mb-6 flex items-end gap-4 border-b border-neutral-800 pb-4">
            <span className="font-poster text-7xl leading-[0.8] text-transparent [-webkit-text-stroke:1.5px_var(--color-brand-500)] max-sm:text-6xl">0{p + 1}</span>
            <div>
              <h2 className="font-display text-3xl font-extrabold text-neutral-50 max-sm:text-2xl">{phase.title}</h2>
              <p className="text-sm text-neutral-400">{phase.blurb}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            {STEPS.filter((s) => s.phase === p).map((s, k) => {
              const wide = !s.step.shots?.length || s.step.models;
              return (
                <article
                  key={s.n}
                  id={anchor(s.n)}
                  className={cn(
                    "panel grid scroll-mt-28 items-start gap-6 p-6 max-sm:p-4",
                    !wide && "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
                  )}
                >
                  <div className={cn("flex flex-col gap-3", !wide && k % 2 === 1 && "lg:order-2")}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgb(232_38_94/0.8)]">{s.n}</span>
                      <Where where={s.step.where} />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-neutral-50">{s.step.title}</h3>
                    <StepBody step={s.step} />
                  </div>
                  <Shots step={s.step} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/** C: Step-through. One step at a time with a big screenshot, Back and Next, and a checklist that remembers progress. */
const DONE_KEY = "ms.keyGuide.done";
export function GuideStepper() {
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      setDone(new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]")));
    } catch {
      // Private window: progress lasts for this visit.
    }
  }, []);
  const save = (next: Set<number>) => {
    setDone(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
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
  const s = STEPS[at];
  const pct = Math.round((done.size / STEPS.length) * 100);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <Hero compact />
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
                  <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500 first:mt-0">{GUIDE_PHASES[x.phase].title}</p>
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
              Step <b className="font-display text-neutral-50">{s.n}</b> of {STEPS.length} · {GUIDE_PHASES[s.phase].title}
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
              <button type="button" onClick={() => save(new Set(done).add(s.n))} className="h-10 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 active:scale-95">
                Finish ✓
              </button>
            )}
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
