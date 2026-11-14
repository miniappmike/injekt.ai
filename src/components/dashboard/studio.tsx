"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BadgeCheck, CircleAlert, Clapperboard, ImagePlus, Plus, Upload } from "lucide-react";
import { InjectIcon, PasteIcon } from "@/components/icons";
import { usePasteTarget } from "@/components/paste-router";
import { readClipboardImages } from "@/lib/clipboard";
import type { DashCharacter } from "@/lib/dashboard-types";
import { stashFiles } from "@/lib/handoff";
import { cn } from "@/lib/utils";

const ACTION = "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";

/**
 * The model in focus and the place to start a picture of her. Tapping another avatar puts that model in focus, and
 * Inject, Director and the drop zone all follow whoever is showing.
 */
export function Studio({ characters, focusId, heroClass, dropClass }: { characters: DashCharacter[]; focusId: string | null; heroClass?: string; dropClass?: string }) {
  const [id, setId] = useState(focusId);
  const focus = characters.find((c) => c.id === id) ?? characters[0];

  if (!focus) {
    return (
      <>
        <section className={cn("panel relative flex min-h-[20rem] flex-col justify-end overflow-hidden p-5", heroClass)}>
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgb(232_38_94/0.28),transparent_60%)]" />
          <p className="relative font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Start here</p>
          <h2 className="relative mt-2 font-display text-2xl font-bold text-neutral-50">Create your first model</h2>
          <p className="relative mt-1.5 text-sm leading-relaxed text-neutral-300">One clear face photo is all you need. Everything else is built from it.</p>
          <Link href="/reference-sheet" className={cn(ACTION, "glow-brand relative mt-5 flex-none bg-gradient-to-b from-brand-400 to-brand-600 text-white hover:from-brand-300 hover:to-brand-500")}>
            Create Model
          </Link>
          <Link href="/marketplace" className="relative mt-3 text-center text-sm text-neutral-400 underline-offset-4 hover:text-neutral-100 hover:underline">Or browse ready-made personas</Link>
        </section>
        <DropZone characterId={null} name={null} className={dropClass} />
      </>
    );
  }

  return (
    <>
      <section aria-label="Your model" className={cn("panel flex flex-col overflow-hidden", heroClass)}>
        <div className="relative min-h-[15rem] flex-1 bg-gradient-to-br from-neutral-800 to-neutral-950">
          {focus.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={focus.id} src={focus.photo} alt="" className="absolute inset-0 h-full w-full animate-fade-in object-cover object-top" />
          )}
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-transparent" />
          <span className={cn("absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md", focus.ready ? "border-white/20 bg-neutral-950/70 text-white" : "border-amber-400/40 bg-neutral-950/75 text-amber-200")}>
            {focus.ready ? <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-300" /> : <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />}
            {focus.ready ? "Ready" : "Needs her sheets"}
          </span>
          <Link href="/characters" className="absolute right-3 top-3 rounded-full border border-white/20 bg-neutral-950/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-neutral-950/90">
            All characters
          </Link>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-xs text-neutral-300">Working on</p>
            <h2 className="font-poster text-[2.6rem] leading-[0.9] tracking-wide text-white uppercase [text-wrap:balance]">{focus.name}</h2>
            <p className="mt-1.5 text-xs text-neutral-300">
              Reference photos <span className="font-semibold text-brand-300">{focus.refs}/{focus.maxRefs}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 p-3 pb-2">
          {focus.ready ? (
            <>
              <Link href={`/inject?character=${focus.id}`} className={cn(ACTION, "glow-brand bg-gradient-to-b from-brand-400 to-brand-600 text-white hover:from-brand-300 hover:to-brand-500")}>
                <InjectIcon className="h-[18px] w-[18px]" />
                Inject
              </Link>
              <Link href={`/director?character=${focus.id}`} className={cn(ACTION, "border border-neutral-700 bg-neutral-800 text-neutral-50 hover:border-neutral-600 hover:bg-neutral-700")}>
                <Clapperboard aria-hidden="true" className="h-[18px] w-[18px] text-iris-400" />
                Director
              </Link>
            </>
          ) : (
            <Link href={`/reference-sheet?character=${focus.id}`} className={cn(ACTION, "glow-brand bg-gradient-to-b from-brand-400 to-brand-600 text-white hover:from-brand-300 hover:to-brand-500")}>
              Build her sheets
            </Link>
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-3 pt-1">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setId(c.id)}
              aria-label={`Work on ${c.name}`}
              aria-pressed={c.id === focus.id}
              title={c.name}
              className={cn(
                "h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-800 ring-2 ring-offset-2 ring-offset-neutral-900 transition-transform active:scale-95 focus-visible:outline-none",
                c.id === focus.id ? "ring-brand-500" : "ring-neutral-700 hover:ring-neutral-500 focus-visible:ring-brand-400",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover object-top" /> : <span className="text-xs font-bold text-neutral-300">{c.name.slice(0, 1)}</span>}
            </button>
          ))}
          <Link href="/reference-sheet" aria-label="Create a new model" title="Create a new model" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-600 text-neutral-400 transition-colors hover:border-brand-500/60 hover:text-white">
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <DropZone characterId={focus.ready ? focus.id : null} name={focus.name} className={dropClass} />
    </>
  );
}

/** Drop, paste or choose a photo here and Inject opens with it already added, for the model in focus. */
function DropZone({ characterId, name, className }: { characterId: string | null; name: string | null; className?: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string>();
  const send = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || !characterId) return;
    stashFiles(images);
    router.push(`/inject?character=${characterId}`);
  };
  usePasteTarget(box, send, !characterId);

  return (
    <section
      ref={box}
      tabIndex={characterId ? 0 : -1}
      aria-label="Start from a photo"
      onDragOver={(e) => {
        if (!characterId) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        send(Array.from(e.dataTransfer.files));
      }}
      className={cn("dropzone flex flex-col items-center justify-center gap-2 p-5 text-center max-lg:flex-row max-lg:justify-between max-lg:gap-3 max-lg:p-4 max-lg:text-left", over && "border-brand-500/70 bg-brand-500/10", !characterId && "opacity-60", className)}
    >
      <div className="flex flex-col items-center gap-2 max-lg:min-w-0 max-lg:flex-row max-lg:gap-3">
        <ImagePlus aria-hidden="true" className="h-7 w-7 shrink-0 text-brand-300" strokeWidth={1.7} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold whitespace-nowrap text-neutral-50">
            <span className="max-lg:hidden">Drop or paste a photo</span>
            <span className="lg:hidden">Start from a photo</span>
          </p>
          <p className="text-xs text-neutral-400 max-lg:truncate">{characterId ? `${name} goes straight into it` : name ? `${name} needs her sheets first` : "Create a model first"}</p>
          {error && <p role="alert" className="mt-1 text-xs text-amber-300">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 lg:mt-1">
        <button
          type="button"
          disabled={!characterId}
          aria-label="Paste a photo from the clipboard"
          onClick={async () => {
            try {
              send(await readClipboardImages());
              setError(undefined);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't paste.");
            }
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800/70 text-neutral-200 transition-all hover:border-brand-500/60 hover:text-white active:scale-95 disabled:pointer-events-none"
        >
          <PasteIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          disabled={!characterId}
          onClick={() => input.current?.click()}
          className="flex h-10 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800/70 px-3.5 text-sm font-semibold text-neutral-100 transition-all hover:border-brand-500/60 active:scale-95 disabled:pointer-events-none"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          Upload
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          send(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </section>
  );
}
