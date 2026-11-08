"use client";

import { useEffect, useState } from "react";
import { useGeneration } from "@/components/app-context";
import { GENERATOR } from "@/lib/links";

const KEY = "ms.howItWorksHidden";

/** Three steps for first-timers, above the Inject tools. Hidden for good once dismissed. */
export function HowItWorks() {
  const generation = useGeneration();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;

  const steps = [
    { title: "Pick your character", body: "Who goes in the photo. New here? Create one first from Characters." },
    { title: "Add a photo", body: "Any photo with the pose, outfit and scene you want her in." },
    generation
      ? { title: "Write, then generate", body: "Press Write prompts, then Generate, or copy the prompt to use anywhere." }
      : { title: `Copy it to ${GENERATOR.name}`, body: "Press Write prompts, then Copy & open. Attach the images shown, in order, and paste." },
  ];
  return (
    <section aria-label="How it works" className="panel relative mt-5 animate-fade-up p-4 max-sm:mt-3 max-sm:rounded-2xl max-sm:p-3">
      <button
        type="button"
        aria-label="Hide how it works"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // Shown again next visit.
          }
        }}
        className="absolute right-2 top-2 rounded-md px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      >
        ✕
      </button>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">How it works</p>
      <ol className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 max-sm:flex-col max-sm:gap-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300 ring-1 ring-brand-500/40">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-100 max-sm:text-xs max-sm:leading-tight">{s.title}</p>
              <p className="text-xs leading-relaxed text-neutral-400 max-sm:hidden">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
