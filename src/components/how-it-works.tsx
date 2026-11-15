"use client";

import { useId, useState } from "react";
import { useGeneration } from "@/components/app-context";
import { ChevronIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface HowStep {
  title: string;
  body: string;
}

/** Three steps for first-timers, above a tool. Starts collapsed (one slim bar); open it to read the steps. */
export function HowItWorks({ steps }: { steps?: HowStep[] }) {
  const generation = useGeneration();
  const [open, setOpen] = useState(false);
  const id = useId();

  const list: HowStep[] = steps ?? [
    { title: "Pick your character", body: "Who goes in the photo. New here? Create one first from Characters." },
    { title: "Add a photo", body: "Any photo with the pose, outfit and scene you want her in." },
    generation
      ? { title: "Write, then generate", body: "Press Write prompts, then Generate, or copy the prompt to use anywhere." }
      : { title: "Copy the prompt", body: "Press Write prompts, then Copy prompt, and paste it into your image generator with the images shown, in order." },
  ];
  return (
    <section aria-label="How it works" className="panel mt-5 animate-fade-up p-0 max-sm:mt-3 max-sm:rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[inherit] px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-400 transition-colors hover:text-brand-300 max-sm:px-3"
      >
        How it works
        <ChevronIcon className={cn("h-3.5 w-3.5 transition-transform duration-200", open ? "-rotate-90" : "rotate-90")} />
      </button>
      {open && (
        <ol id={id} className="grid grid-cols-3 gap-2 px-4 pb-4 sm:gap-3 max-sm:px-3 max-sm:pb-3">
          {list.map((s, i) => (
            <li key={s.title} className="flex gap-3 max-sm:flex-col max-sm:gap-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300 ring-1 ring-brand-500/40">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-100 max-sm:text-xs max-sm:leading-tight">{s.title}</p>
                <p className="text-xs leading-relaxed text-neutral-400 max-sm:hidden">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
