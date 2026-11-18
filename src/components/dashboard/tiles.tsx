"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Brush, Check } from "lucide-react";
import { EyeIcon, EyeOffIcon, LikenessIcon, VariantsIcon } from "@/components/icons";
import { setGeneration } from "@/app/(app)/settings/api-keys/actions";
import type { DashImage, StepKey } from "@/lib/dashboard-types";
import { openHistory, viewImage } from "@/lib/panel-events";
import { timeLeft } from "@/lib/retention";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

const GUIDE = "/guides/getting-started";

/**
 * Getting started, as three things in plain words: make her, put her in a photo, pin your best one. Nobody ticks these
 * off: each is read from the account (she exists with both sheets, an image was made, an image was pinned). All three
 * show at once, so the whole path is visible; the one to do now is opened with exactly what to press. Once they are
 * done the tile is replaced by the quick tools for good. (A likeness check is no longer a required step.)
 */
export function NextStep({ steps, focusId, className }: { steps: Record<StepKey, boolean>; focusId: string | null; className?: string }) {
  const q = focusId ? `?character=${focusId}` : "";
  const list: { done: boolean; title: string; body: string; cta: string; href?: string }[] = [
    {
      done: steps.model && steps.sheets,
      title: "Make her",
      body: steps.model ? "She needs her face sheet and body sheet. Open Create Model and finish the steps." : "Add one clear photo of her face. Create Model builds the rest in about 5 minutes.",
      cta: steps.model ? "Finish in Create Model" : "Open Create Model",
      href: `/reference-sheet${steps.model ? q : ""}`,
    },
    { done: steps.image, title: "Put her in a photo", body: "Drop in any photo you like, press Write prompts, then Generate image.", cta: "Open Inject", href: `/inject${q}` },
    { done: steps.pin, title: "Pin your best one", body: "Open an image you love and press Pin It, so the next ones look even more like her.", cta: "Open your images" },
  ];
  const at = list.findIndex((x) => !x.done);
  if (at === -1) return <QuickTools className={className} />;
  const cta = "glow-brand inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";
  return (
    <section aria-label={`Getting started, step ${at + 1} of ${list.length}`} className={cn("panel flex flex-col gap-3 border-iris-500/30 bg-[linear-gradient(150deg,rgb(91_91_246/0.14),transparent_55%)] p-4 sm:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn(LABEL, "text-iris-400")}>Getting started</p>
        <Link href={GUIDE} className="shrink-0 whitespace-nowrap text-xs font-semibold text-iris-400 underline-offset-4 hover:underline">
          Show me how
        </Link>
      </div>
      <ol className="flex flex-col gap-2">
        {list.map((x, i) => (
          <li key={x.title} className={cn("flex gap-3 rounded-xl", i === at && "bg-neutral-950/40 p-3 ring-1 ring-iris-500/30")}>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                x.done ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40" : i === at ? "bg-brand-500 text-white" : "bg-neutral-800 text-neutral-500",
              )}
            >
              {x.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <p className={cn("font-display font-bold leading-snug", i === at ? "text-base text-neutral-50" : x.done ? "text-sm text-neutral-400 line-through decoration-neutral-600" : "text-sm text-neutral-500")}>
                {x.title}
                {x.done && <span className="sr-only"> (done)</span>}
              </p>
              {i === at && (
                <>
                  <p className="text-sm leading-relaxed text-neutral-300">{x.body}</p>
                  {x.href ? (
                    <Link href={x.href} className={cn(cta, "self-start")}>
                      {x.cta}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button type="button" onClick={() => openHistory("images")} className={cn(cta, "self-start")}>
                      {x.cta}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TOOLS = [
  { href: "/variants", label: "Variants", Icon: VariantsIcon },
  { href: "/likeness", label: "Likeness", Icon: LikenessIcon },
  { href: "/art-to-real", label: "Art to Real", Icon: Brush },
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

/** Images the person blurred on the dashboard, remembered in this browser. */
const BLURRED_KEY = "ms.blurredRecent";
function readBlurred(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(BLURRED_KEY) || "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
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
  const [blurred, setBlurred] = useState<Set<string>>(new Set());
  useEffect(() => setBlurred(readBlurred()), []);
  const toggleBlur = (id: string) =>
    setBlurred((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      try {
        // Only ids still shown are kept, so the list can't grow forever.
        const keep = [...next].filter((x) => images.some((i) => i.id === x));
        localStorage.setItem(BLURRED_KEY, JSON.stringify(keep));
      } catch {
        // Private windows can refuse storage; the blur then lasts until reload.
      }
      return next;
    });
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
              <li key={i.id} className="group relative w-[30%] min-w-[6.25rem] shrink-0 sm:w-auto sm:min-w-0 sm:flex-1">
                <button
                  type="button"
                  onClick={() => {
                    const shot = (x: typeof i) => ({ url: x.url, downloadUrl: x.downloadUrl, prompt: x.prompt, generated: true, generationId: x.id, blurred: blurred.has(x.id) });
                    // The recent images in order, so the viewer's arrow keys step through them.
                    viewImage({ ...shot(i), gallery: images.map(shot) });
                  }}
                  aria-label={`View image${left ? `, ${left.label}` : ""}`}
                  className="thumb relative block aspect-[3/4] w-full overflow-hidden bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.url} alt="" loading="lazy" className={cn("h-full w-full object-cover object-top transition-[filter,transform] duration-200", blurred.has(i.id) && "scale-110 blur-xl")} />
                  {left && (
                    <span className={cn("absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md", soon ? "bg-brand-500" : "bg-neutral-950/75")}>{left.label}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleBlur(i.id)}
                  aria-pressed={blurred.has(i.id)}
                  aria-label={blurred.has(i.id) ? "Show image" : "Blur image"}
                  title={blurred.has(i.id) ? "Show image" : "Blur image"}
                  className={cn(
                    "absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_6px_20px_-8px_rgb(232_38_94/0.7)] transition-all hover:scale-105 hover:from-brand-300 hover:to-brand-500 active:scale-90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    // Shown on hover on a computer, always on a touch screen, and always while the image is blurred.
                    blurred.has(i.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
                  )}
                >
                  {blurred.has(i.id) ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
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
