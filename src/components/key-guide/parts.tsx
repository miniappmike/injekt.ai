"use client";

import Link from "next/link";
import { useState } from "react";
import { viewImage } from "@/lib/panel-events";
import { GUIDE_MODELS, GUIDE_MODELS_NOTE, guideRich, LATEST_TIP, type GuideShot, type GuideStep } from "@/lib/key-guide";
import { InfoTip } from "@/components/info-tip";
import { REFERRAL_DISCLOSURE, SPICYAPI_REFERRAL_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

const LINK = "font-semibold text-brand-300 underline decoration-brand-500/50 underline-offset-4 transition-colors hover:text-brand-200 hover:decoration-brand-300";

/** Text with **bold** button names, *italics* and [links](/path). Links open in a new tab, so the guide stays open. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {guideRich(text).map((p, i) => {
        if (typeof p === "string") return <span key={i}>{p}</span>;
        if ("b" in p) return <b key={i} className="font-semibold text-neutral-50">{p.b}</b>;
        if ("i" in p) return <em key={i} className="text-neutral-100">{p.i}</em>;
        return p.href.startsWith("/") ? (
          <Link key={i} href={p.href} target="_blank" className={LINK}>{p.text}</Link>
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noreferrer" className={LINK}>{p.text}</a>
        );
      })}
    </>
  );
}

const WHERE = {
  spicyapi: { label: "On SpicyAPI", pill: "bg-amber-400/10 text-amber-300 ring-amber-400/30", dot: "bg-amber-300" },
  modelspawn: { label: "On ModelSpawn", pill: "bg-brand-500/10 text-brand-300 ring-brand-500/30", dot: "bg-brand-400" },
  telegram: { label: "In Telegram", pill: "bg-[#2aabee]/10 text-[#7cc9f0] ring-[#2aabee]/30", dot: "bg-[#2aabee]" },
} as const;

/** Where a step happens: SpicyAPI (gold, like their buttons), ModelSpawn (crimson) or Telegram (its blue). */
export function Where({ where, className }: { where: GuideStep["where"]; className?: string }) {
  const w = WHERE[where];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", w.pill, className)}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", w.dot)} />
      {w.label}
    </span>
  );
}

/** The label on a screenshot's frame, so phone and computer screenshots are easy to tell apart. */
const DEVICE = {
  phone: { label: "📱 Phone app", color: "text-amber-300" },
  web: { label: "💻 Web or desktop", color: "text-[#7cc9f0]" },
  site: { label: "ModelSpawn", color: "text-brand-300" },
} as const;

/** A screenshot in a window frame, labelled with where it was taken. Click for full size. */
export function Shot({ shot, className, chrome = true }: { shot: GuideShot; className?: string; chrome?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => viewImage({ url: shot.src, title: shot.alt })}
      aria-label={`${shot.alt} (view full size)`}
      className={cn(
        "group/shot block w-full overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-left shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-[0_30px_70px_-30px_rgb(232_38_94/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
        className,
      )}
    >
      {chrome && (
        <span aria-hidden="true" className="flex items-center gap-1.5 border-b border-white/5 bg-neutral-900 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          {shot.device && <span className={cn("ml-1.5 text-[10px] font-semibold uppercase tracking-wide", DEVICE[shot.device].color)}>{DEVICE[shot.device].label}</span>}
          <span className="ml-auto text-[10px] text-neutral-500 opacity-0 transition-opacity group-hover/shot:opacity-100">Click to enlarge</span>
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" className="block h-auto w-full" />
      {shot.caption && <span className="block border-t border-white/5 bg-neutral-900 px-3 py-2 text-[13px] leading-snug text-neutral-300"><Rich text={shot.caption} /></span>}
    </button>
  );
}

export function Note({ tone, text }: { tone: "warn" | "tip"; text: string }) {
  return (
    <p
      className={cn(
        "flex gap-2.5 rounded-xl border p-3 text-sm leading-relaxed",
        tone === "warn" ? "border-amber-400/30 bg-amber-400/[0.07] text-amber-100" : "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100",
      )}
    >
      <span aria-hidden="true" className="mt-px">{tone === "warn" ? "⚠️" : "💡"}</span>
      <span><Rich text={text} /></span>
    </p>
  );
}

export function Points({ points }: { points: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[15px] text-neutral-300">
      {points.map((p) => (
        <li key={p} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span><Rich text={p} /></span>
        </li>
      ))}
    </ul>
  );
}

/** The referral button, with the disclosure under it. */
export function SpicyCta({ size = "lg", disclosure = true }: { size?: "lg" | "md"; disclosure?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <a
        href={SPICYAPI_REFERRAL_URL}
        target="_blank"
        rel="noopener sponsored"
        className={cn(
          "glow-brand inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 font-semibold text-white transition-all hover:from-brand-300 hover:to-brand-500 active:scale-95",
          size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm",
        )}
      >
        Open SpicyAPI
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
        </svg>
      </a>
      {disclosure && <p className="max-w-md text-xs text-neutral-500">{REFERRAL_DISCLOSURE}</p>}
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
        } catch {
          // The ID is on screen to select by hand.
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="group/id flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2.5 py-1.5 text-left font-mono text-[12px] text-neutral-300 transition-colors hover:border-neutral-600"
      aria-label={`Copy ${id}`}
    >
      <span className="truncate">{id}</span>
      <span className={cn("shrink-0 font-sans text-[11px] font-semibold", done ? "text-emerald-300" : "text-neutral-500 group-hover/id:text-neutral-200")}>{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

/** Our model picks for the Vision and Image keys, with IDs to copy. */
export function ModelPicks() {
  const group = (label: string, what: string, list: readonly { name: string; id: string; note: string }[]) => (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <div>
        <p className="text-sm font-semibold text-neutral-100">{label}</p>
        <p className="text-xs text-neutral-500">{what}</p>
      </div>
      {list.map((m) => (
        <div key={m.id} className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-neutral-200">
            {m.name}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", m.note === "Latest Iteration" ? "bg-brand-500/15 text-brand-300" : "bg-neutral-800 text-neutral-400")}>{m.note}</span>
            {m.note === "Latest Iteration" && <InfoTip label="About Latest Iteration">{LATEST_TIP}</InfoTip>}
          </p>
          <CopyId id={m.id} />
        </div>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <Note tone="tip" text={GUIDE_MODELS_NOTE} />
      <div className="grid gap-3 sm:grid-cols-2">
        {group("Vision models", "Write prompts, read images and build profiles.", GUIDE_MODELS.vision)}
        {group("Image models", "Make the images. Seedream gives the most freedom.", GUIDE_MODELS.image)}
      </div>
      <p className="text-xs text-neutral-500">Any SpicyAPI image model works, including Nano Banana and GPT Image.</p>
    </div>
  );
}

/** Everything a step says, apart from its title and screenshots. */
export function StepBody({ step }: { step: GuideStep }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] leading-relaxed text-neutral-300"><Rich text={step.body} /></p>
      {step.points && <Points points={step.points} />}
      {[step.note ?? []].flat().map((n) => <Note key={n.text} {...n} />)}
      {step.models && <ModelPicks />}
      {step.cta && <SpicyCta size="md" />}
    </div>
  );
}
