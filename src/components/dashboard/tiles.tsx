"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Brush, Check } from "lucide-react";
import { GroupIcon, LikenessIcon, VariantsIcon } from "@/components/icons";
import { setGeneration } from "@/app/(app)/settings/api-keys/actions";
import { STEP_ORDER, type DashImage, type StepKey } from "@/lib/dashboard-types";
import { openHistory, viewImage } from "@/lib/panel-events";
import { timeLeft } from "@/lib/retention";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

/**
 * The first five things a new account does. Nobody ticks these off: each one is read from the account (a model
 * exists, she has her sheets, an image was made, a likeness check ran, an image was pinned). Once all five are done
 * the tile is replaced by the quick tools for good.
 */
export function NextStep({ steps, focusId, className }: { steps: Record<StepKey, boolean>; focusId: string | null; className?: string }) {
  const q = focusId ? `?character=${focusId}` : "";
  const copy: Record<StepKey, { title: string; body: string; cta: string; href?: string }> = {
    model: { title: "Create your first model", body: "Start with one clear photo of her face.", cta: "Open Create Model", href: "/reference-sheet" },
    sheets: { title: "Build her face and body sheets", body: "They keep her the same in every picture.", cta: "Continue in Create Model", href: `/reference-sheet${q}` },
    image: { title: "Make your first image", body: "Add a photo you like and put her in it.", cta: "Open Inject", href: `/inject${q}` },
    likeness: { title: "Check an image for likeness", body: "See how close it is to her, trait by trait.", cta: "Open Likeness", href: `/likeness${q}` },
    pin: { title: "Pin your best image", body: "Pin It on any image adds it to her reference photos.", cta: "Open your images" },
  };
  const key = STEP_ORDER.find((k) => !steps[k]);
  if (!key) return <QuickTools className={className} />;
  const doneCount = STEP_ORDER.filter((k) => steps[k]).length;
  const step = copy[key];
  const cta = "mt-auto inline-flex items-center gap-1.5 self-start rounded-md text-sm font-semibold text-iris-400 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500/60";
  return (
    <section aria-label="Getting started" className={cn("panel flex flex-col gap-2.5 border-iris-500/30 bg-[linear-gradient(150deg,rgb(91_91_246/0.14),transparent_55%)] p-4 sm:p-5", className)}>
      <p className={cn(LABEL, "text-iris-400")}>Next step · {doneCount + 1} of {STEP_ORDER.length}</p>
      <h2 className="font-display text-lg font-bold leading-snug text-neutral-50">{step.title}</h2>
      <p className="text-sm text-neutral-400">{step.body}</p>
      <ol aria-label={`${doneCount} of ${STEP_ORDER.length} done`} className="my-1 flex gap-1.5">
        {STEP_ORDER.map((k) => (
          <li key={k} className={cn("flex h-1.5 flex-1 rounded-full", steps[k] ? "bg-iris-500" : k === key ? "bg-iris-500/40" : "bg-neutral-700")} />
        ))}
      </ol>
      {step.href ? (
        <Link href={step.href} className={cta}>
          {step.cta}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      ) : (
        <button type="button" onClick={() => openHistory("images")} className={cta}>
          {step.cta}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

const TOOLS = [
  { href: "/variants", label: "Variants", Icon: VariantsIcon },
  { href: "/likeness", label: "Likeness", Icon: LikenessIcon },
  { href: "/art-to-real", label: "Art to Real", Icon: Brush },
  { href: "/characters#group", label: "Group photo", Icon: GroupIcon },
];

/** What takes the next-step tile's place once the first steps are done. */
function QuickTools({ className }: { className?: string }) {
  return (
    <section aria-label="Quick tools" className={cn("panel flex flex-col gap-3 p-4 sm:p-5", className)}>
      <p className={cn(LABEL, "text-neutral-500")}>Quick tools</p>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {TOOLS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-800/50 text-[13px] font-semibold text-neutral-100 transition-all hover:border-brand-500/50 hover:bg-neutral-800 active:scale-[0.97]">
            <Icon className="h-5 w-5 text-brand-300" />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The newest images still on the site, each with the time it has left. Tap one to view, save, or pin it. */
export function RecentImages({ images, className }: { images: DashImage[]; className?: string }) {
  // The countdown is worked out in the browser, so the server and the first paint can't disagree about "now".
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <section aria-label="Recent images" className={cn("panel flex flex-col gap-3 p-4 sm:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold text-neutral-50">
          Recent images <span className="ml-1 text-xs font-normal text-neutral-500">save them before they expire</span>
        </h2>
        {images.length > 0 && (
          <button type="button" onClick={() => openHistory("images")} className="shrink-0 rounded-md text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            See all
          </button>
        )}
      </div>
      {images.length ? (
        <ul className="no-scrollbar -mx-1 flex flex-1 gap-2.5 overflow-x-auto px-1 pb-1">
          {images.map((i) => {
            const left = now ? timeLeft(i.expiresAt, now) : null;
            const soon = !!now && new Date(i.expiresAt).getTime() - now.getTime() < 12 * 3_600_000;
            return (
              <li key={i.id} className="w-[30%] min-w-[6.25rem] shrink-0 sm:w-auto sm:min-w-0 sm:flex-1">
                <button
                  type="button"
                  onClick={() => viewImage({ url: i.url, downloadUrl: i.downloadUrl, prompt: i.prompt, generated: true, generationId: i.id })}
                  aria-label={`View image${left ? `, ${left.label}` : ""}`}
                  className="thumb relative block aspect-[3/4] w-full overflow-hidden bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.url} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                  {left && (
                    <span className={cn("absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md", soon ? "bg-brand-500" : "bg-neutral-950/75")}>{left.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex flex-1 items-center rounded-xl border border-dashed border-neutral-800 px-4 py-6 text-sm text-neutral-500">Images you make show up here for 72 hours, with a countdown on each.</p>
      )}
    </section>
  );
}

/** The image generation switch, working in place. Off, every tool writes prompts to paste elsewhere. */
export function GenerationSwitch({ enabled, className }: { enabled: boolean; className?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => setOn(enabled), [enabled]);
  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(false);
    const r = await setGeneration({ enabled: next, confirmed: next });
    setBusy(false);
    if (!r.ok) {
      setOn(!next);
      return setError(true);
    }
    router.refresh();
  }
  return (
    <section className={cn("panel flex flex-col gap-2 p-4", className)}>
      <p className="text-xs text-neutral-400" id="dash-gen">Image generation</p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="dash-gen"
        disabled={busy}
        onClick={toggle}
        className={cn("relative h-7 w-12 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:opacity-70", on ? "bg-brand-500" : "bg-neutral-700")}
      >
        <span className={cn("absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white transition-all duration-200", on ? "left-6" : "left-1")}>{on && <Check aria-hidden="true" className="h-3 w-3 text-brand-600" strokeWidth={3} />}</span>
      </button>
      <p className="mt-auto text-xs text-neutral-400">{error ? <span className="text-amber-300">Couldn&apos;t save. Try again.</span> : on ? "On: images are made here" : "Off: prompts to copy only"}</p>
    </section>
  );
}
