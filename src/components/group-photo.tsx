"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCard, type CharacterCardData } from "@/components/character-card";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { CheckIcon, CloseIcon, GroupIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

// Browser copies of the limits in src/lib/ai/prompts/group.ts (that file is server prompt text).
const MAX_GROUP = 4;
const MIN_GROUP = 2;
const MAX_DIRECTION = 1500;
const DEFAULT_DIRECTION = "A candid photo of them together, like friends posing for a phone photo on a night out, each in a stylish outfit that suits the setting.";

/**
 * The characters grid with Group photo: a button by "New character" (only when image generation is on) turns the cards
 * into a picker for up to four characters; a dock shows who is picked, and Continue opens the creative-direction
 * composer with Generate.
 */
export function CharactersBoard({ characters, canList, atLimit, limitText }: { characters: CharacterCardData[]; canList: boolean; atLimit: boolean; limitText: string }) {
  const generation = useGeneration();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const usable = characters.filter(hasRefs);
  const canGroup = generation && usable.length >= MIN_GROUP;

  // Turning generation off elsewhere ends group mode.
  useEffect(() => {
    if (!generation) {
      setPicking(false);
      setComposing(false);
    }
  }, [generation]);

  const stop = useCallback(() => {
    setPicking(false);
    setComposing(false);
    setPicked([]);
  }, []);

  useEffect(() => {
    if (!picking || composing) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && stop();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [picking, composing, stop]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_GROUP ? p : [...p, id]));
  const chosen = picked.map((id) => characters.find((c) => c.id === id)).filter((c): c is CharacterCardData => !!c);

  return (
    <div className={cn(picking && "pb-28 max-sm:pb-12")}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 max-sm:mb-4">
        <h1 className="page-title">Characters</h1>
        <div className="flex items-center gap-2 max-sm:w-full">
          {generation && (
            <Button
              type="button"
              variant="outline"
              aria-pressed={picking}
              disabled={!canGroup}
              title={canGroup ? "Put 2 to 4 of your characters in one photo" : "You need at least 2 characters with reference images"}
              onClick={() => (picking ? stop() : setPicking(true))}
              className={cn(
                "group/gp relative overflow-hidden rounded-full border-iris-500/40 bg-iris-500/[0.07] pl-3.5 text-neutral-100 hover:border-iris-400/70 hover:bg-iris-500/15 max-sm:flex-1",
                picking && "border-iris-400/80 bg-iris-500/20",
              )}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover/gp:translate-x-full" />
              {picking ? <CloseIcon className="h-4 w-4" /> : <GroupIcon className="h-[18px] w-[18px] text-iris-300" />}
              {picking ? "Cancel" : "Group photo"}
            </Button>
          )}
          {atLimit ? (
            <Button disabled className="max-sm:flex-1">New character</Button>
          ) : (
            <Button asChild className="max-sm:flex-1"><Link href="/characters/new">New character</Link></Button>
          )}
        </div>
      </div>
      {atLimit && <p className="mb-4 text-sm text-neutral-400">{limitText}</p>}
      {picking && (
        <p className="mb-4 flex animate-fade-up items-center gap-2 text-sm text-neutral-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-iris-400" aria-hidden="true" />
          Pick up to {MAX_GROUP} characters for your group photo.
        </p>
      )}
      {!characters.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-700 px-6 py-16 text-center">
          <p className="text-neutral-400">No characters yet. Create your first one.</p>
        </div>
      ) : (
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {characters.map((c) => {
            const at = picked.indexOf(c.id);
            const on = at !== -1;
            const ok = hasRefs(c);
            const full = !on && picked.length >= MAX_GROUP;
            return (
              <div key={c.id} className="relative">
                <div className={cn("transition-all duration-300", picking && !on && "opacity-70", picking && (full || !ok) && "opacity-40 saturate-50")}>
                  <CharacterCard c={c} canList={canList} />
                </div>
                {picking && (
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={ok ? `${on ? "Remove" : "Add"} ${c.name}` : `${c.name} needs reference images first`}
                    disabled={!ok || full}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "absolute inset-0 z-20 animate-fade-in cursor-pointer rounded-2xl ring-inset transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400 max-sm:rounded-[1.25rem] disabled:cursor-not-allowed",
                      on ? "bg-iris-500/10 ring-2 ring-iris-400 shadow-[0_0_0_4px_rgb(91_91_246/0.18),0_20px_50px_-20px_rgb(91_91_246/0.6)]" : "ring-1 ring-white/5 hover:bg-white/[0.03] hover:ring-iris-400/50",
                    )}
                  >
                    <span
                      className={cn(
                        // Sits exactly over the card's magnifier button (same place and size), so it covers it fully.
                        "absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all duration-200 max-sm:left-2 max-sm:top-2",
                        on ? "animate-pop-in bg-gradient-to-br from-iris-400 to-iris-600 text-white shadow-lg ring-1 ring-white/30" : "bg-neutral-950 ring-1 ring-white/20",
                      )}
                    >
                      {on ? at + 1 : <span aria-hidden="true" className="h-4 w-4 rounded-full ring-2 ring-white/70" />}
                    </span>
                    {!ok && <span className="absolute inset-x-3 bottom-3 rounded-full bg-neutral-950/80 px-2 py-1 text-center text-[11px] font-semibold text-neutral-300">Needs reference images</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {picking && !composing && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div role="region" aria-label="Group photo selection" className="flex w-full max-w-lg animate-fade-up items-center gap-3 rounded-full border border-white/10 bg-neutral-950/85 py-2 pl-2 pr-2 shadow-[0_20px_60px_-15px_rgb(0_0_0/0.9),0_0_0_1px_rgb(91_91_246/0.15)] backdrop-blur-xl">
            <div className="flex -space-x-2.5 pl-1">
              {Array.from({ length: MAX_GROUP }, (_, i) => chosen[i]).map((c, i) =>
                c ? <Avatar key={c.id} c={c} className="h-9 w-9 animate-pop-in" /> : <span key={`slot${i}`} aria-hidden="true" className="h-9 w-9 rounded-full border border-dashed border-neutral-600 bg-neutral-900" />,
              )}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm text-neutral-300">
              <b className="text-neutral-50">{picked.length}</b> of {MAX_GROUP}
              <span className="max-sm:hidden">{picked.length < MIN_GROUP ? ` · pick ${MIN_GROUP - picked.length} more` : " selected"}</span>
            </p>
            <Button type="button" variant="iris" disabled={picked.length < MIN_GROUP} onClick={() => setComposing(true)} className="rounded-full">
              Continue
            </Button>
          </div>
        </div>
      )}

      {composing && chosen.length >= MIN_GROUP && (
        <Composer
          chosen={chosen}
          onRemove={(id) => setPicked((p) => p.filter((x) => x !== id))}
          onBack={() => setComposing(false)}
          onClose={stop}
        />
      )}
    </div>
  );
}

const hasRefs = (c: CharacterCardData) => c.thumbs.length > 0;

function Avatar({ c, className }: { c: CharacterCardData; className?: string }) {
  const src = c.photo ?? c.thumbs[0];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={c.name} title={c.name} className={cn("rounded-full object-cover object-top ring-2 ring-neutral-950", className)} />
  ) : (
    <span title={c.name} className={cn("flex items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 text-sm font-bold text-white ring-2 ring-neutral-950", className)}>{c.name.charAt(0)}</span>
  );
}

/** The creative direction and Generate, over the page: centred on wide screens, a bottom sheet on phones. */
function Composer({ chosen, onRemove, onBack, onClose }: { chosen: CharacterCardData[]; onRemove: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const [direction, setDirection] = useState("");

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    document.addEventListener("keydown", key);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = before;
      document.documentElement.classList.remove("sheet-open");
    };
  }, [onBack]);

  const names = chosen.map((c) => c.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:items-end max-sm:p-0">
      <div aria-hidden="true" onClick={onBack} className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-title"
        className="relative flex max-h-[90dvh] w-full max-w-2xl animate-pop-in flex-col gap-5 overflow-y-auto overscroll-contain rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.95)] max-sm:max-h-[90dvh] max-sm:animate-sheet-up max-sm:rounded-b-none max-sm:p-4 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="group-title" className="flex items-center gap-2 font-display text-xl font-bold text-neutral-50">
              <GroupIcon className="h-5 w-5 text-iris-300" /> Group photo
            </h2>
            <p className="mt-1 text-sm text-neutral-400">Each character keeps her own face and body from her references. Your direction sets the rest.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close group photo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-50">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {chosen.map((c, i) => (
            <span key={c.id} className="flex animate-pop-in items-center gap-2 rounded-full border border-neutral-700/80 bg-neutral-950/60 py-1 pl-1 pr-1.5 text-sm text-neutral-100">
              <Avatar c={c} className="h-7 w-7 ring-0" />
              <span className="max-w-[9rem] truncate font-medium">{c.name}</span>
              <span className="text-xs text-neutral-500">#{i + 1}</span>
              <button
                type="button"
                disabled={chosen.length <= MIN_GROUP}
                onClick={() => onRemove(c.id)}
                aria-label={`Remove ${c.name}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {chosen.length < MAX_GROUP && (
            <button type="button" onClick={onBack} className="rounded-full border border-dashed border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:border-iris-400/60 hover:text-neutral-100">
              + Add
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="group-direction" className="text-sm font-semibold text-neutral-100">Creative direction</label>
          <Textarea
            id="group-direction"
            rows={4}
            maxLength={MAX_DIRECTION}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder={`Setting, poses, outfits, mood, lighting, camera... Use their names, e.g. "${names[0]} on the left in a red dress, ${names[1]} laughing beside her, neon-lit Tokyo street at night."`}
            className="resize-y text-[15px] leading-relaxed"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
            <p className="flex items-center gap-1.5">{!direction.trim() && <><CheckIcon className="h-3.5 w-3.5" /> Left blank, you get a candid photo of them together.</>}</p>
            <span className="shrink-0 tabular-nums">{direction.length}/{MAX_DIRECTION}</span>
          </div>
        </div>

        <GenerateImage
          kind="group_photo"
          prompt={direction.trim() || DEFAULT_DIRECTION}
          extraPaths={[]}
          meta={{ group: chosen.map((c) => c.id) }}
          actionLabel="Create group photo"
          autoAspectRatio="3:2"
          autoLabel="wide (3:2)"
          defaultResolution="1.5k"
        />
      </section>
    </div>
  );
}
