"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGeneration } from "@/components/app-context";
import { AttachStrip, TaggedPrompt, type AttachTile } from "@/components/attach-strip";
import { CharacterPicker } from "@/components/character-picker";
import { CopyOpen } from "@/components/copy-open";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { segItem, segTrack } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { createPersona, saveReferenceSheet } from "@/app/(app)/reference-sheet/actions";
import { sheetPrompts } from "@/lib/ai/prompts/sheets";
import type { SheetSlot } from "@/lib/reference-sheet";
import { CUPS, GLUTE_SHAPES, GLUTE_SIZES, MAX_BODY_PHOTOS, SHEET_ASPECT_RATIO, SHEET_LOOKS, SHEET_OUTFITS } from "@/lib/sheet-options";
import type { UploadSlot } from "@/lib/images";
import { cn } from "@/lib/utils";

export interface SheetImage {
  path: string;
  url: string;
}
export interface SheetCharacter {
  id: string;
  name: string;
  faceSheet: SheetImage | null;
  bodySheet: SheetImage | null;
  /** Her picture in the character picker (her face sheet is used without one). */
  photo?: string | null;
}

type Photo = { preview: string; path?: string; error?: string; busy?: boolean };

/** One uploaded photo: shown straight away, then holds the stored path once the upload is done. */
function usePhoto(slot: UploadSlot = "target") {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const pick = useCallback(
    async (file: File, characterId?: string) => {
      const preview = URL.createObjectURL(file);
      setPhoto({ preview, busy: true });
      try {
        setPhoto({ preview, path: await uploadImage(file, slot, characterId) });
      } catch (e) {
        setPhoto({ preview, error: e instanceof Error ? e.message : "Upload failed" });
      }
    },
    [slot],
  );
  return [photo, pick, setPhoto] as const;
}

function PhotoDrop({ title, hint, photo, onPick, layout }: { title: string; hint: string; photo: Photo | null; onPick: (f: File) => void; layout?: "row" | "tile" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <ImageDrop title={title} hint={hint} preview={photo?.preview} disabled={photo?.busy} onPick={onPick} layout={layout} />
      {photo?.busy && <p className="text-xs text-neutral-500">Uploading...</p>}
      {photo?.error && <p role="alert" className="text-sm text-red-400">{photo.error}</p>}
    </div>
  );
}

const STEPS = [
  { id: 1, label: "Face photo", short: "Face" },
  { id: 2, label: "Face sheet", short: "Sheet" },
  { id: 3, label: "Body photos", short: "Body" },
  { id: 4, label: "Reference sheet", short: "Result" },
] as const;

/** The progress line across the top: numbered steps, done ones ticked and tappable to go back. */
function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (n: number) => void }) {
  return (
    <ol aria-label="Steps" className="flex items-start">
      {STEPS.map((s, i) => {
        const done = s.id < step;
        const on = s.id === step;
        const can = s.id <= reached && !on;
        return (
          <li key={s.id} className="flex min-w-0 flex-1 items-start">
            <button
              type="button"
              disabled={!can}
              onClick={() => onGo(s.id)}
              aria-current={on ? "step" : undefined}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 disabled:cursor-default"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold transition-all duration-300",
                  on && "glow-brand scale-110 border-brand-500 bg-brand-500 text-white",
                  done && "border-emerald-400/60 bg-emerald-500/20 text-emerald-300",
                  !on && !done && "border-neutral-700 bg-neutral-900 text-neutral-500",
                  can && "group-hover:border-neutral-500",
                )}
              >
                {done ? (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                ) : (
                  s.id
                )}
              </span>
              <span className={cn("max-w-full truncate px-1 text-center text-[11px] font-semibold leading-tight sm:text-xs", on ? "text-neutral-50" : done ? "text-neutral-300" : "text-neutral-500")}>
                <span className="sm:hidden">{s.short}</span>
                <span className="max-sm:hidden">{s.label}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && <span aria-hidden="true" className={cn("mt-[17px] h-0.5 w-4 shrink-0 rounded-full transition-colors duration-500 sm:w-10", s.id < step ? "bg-emerald-400/50" : "bg-neutral-800")} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Without image generation: the finished prompt, the images to attach in order, and Copy & open. */
function PromptCard({ prompt, items }: { prompt: string; items: AttachTile[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 max-sm:p-3">
      <AttachStrip items={items} photo="" />
      <CopyOpen text={prompt} />
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-400 hover:text-neutral-200">Show the prompt</summary>
        <div className="mt-2 max-h-72 overflow-auto text-neutral-300"><TaggedPrompt text={prompt} /></div>
      </details>
    </div>
  );
}

// Under a finished sheet: make it the persona's face or body sheet. The old one is replaced, so ask first.
function SaveSheet({
  character,
  slot,
  generationId,
  current,
  onSaved,
}: {
  character: SheetCharacter;
  slot: SheetSlot;
  generationId: string;
  current: SheetImage | null;
  onSaved: (image: SheetImage) => void;
}) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});
  const noun = slot === "face_sheet" ? "face sheet" : "body sheet";

  async function save() {
    if (current && !window.confirm(`This replaces ${character.name}'s current ${noun}. Continue?`)) return;
    setState({ busy: true });
    const res = await saveReferenceSheet({ generationId, characterId: character.id, slot });
    if (!res.ok) return setState({ error: res.error });
    onSaved({ path: res.path, url: res.url });
    setState({ saved: true });
  }

  if (state.saved) return <p role="status" className="text-sm text-emerald-300">Saved as {character.name}&apos;s {noun}.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={state.busy}>
          {state.busy ? "Saving..." : `Save as ${character.name}'s ${noun}`}
        </Button>
        <p className="text-xs text-neutral-500">Generated images are deleted after 72 hours. Saving keeps this one.</p>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
    </div>
  );
}

// Hands a finished face sheet to the next step as soon as it's ready.
function UseAsFaceSheet({ generationId, url, onUse }: { generationId: string; url: string; onUse: (sheet: { id: string; url: string }) => void }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onUse({ id: generationId, url });
  }, [generationId, url, onUse]);
  return <p className="text-xs text-neutral-500">Ready for step 3 and 4 as her face sheet.</p>;
}

const select = "h-10 w-full rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm";

function StepCard({ n, title, intro, children }: { n: number; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section key={n} aria-labelledby={`wz-step-${n}`} className="panel flex animate-fade-up flex-col gap-4 p-5 max-sm:rounded-3xl max-sm:p-4">
      <div>
        <h2 id={`wz-step-${n}`} className="font-display text-xl font-bold text-neutral-50 sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function Nav({ onBack, next, nextLabel, nextDisabled, note }: { onBack?: () => void; next: () => void; nextLabel: string; nextDisabled?: boolean; note?: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
      {note && <p className="text-xs text-neutral-500">{note}</p>}
      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        ) : (
          <span />
        )}
        <Button type="button" size="lg" onClick={next} disabled={nextDisabled} className="max-sm:flex-1 sm:min-w-44">{nextLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Creating a persona, step by step: 1 a face photo, 2 a face sheet (made here, or add your own), 3 up to three body
 * photos, 4 the face and body reference sheet. With image generation on, each sheet is made right here and saved to her;
 * otherwise each step hands you a finished prompt (with the images to attach, in order) for your own image generator.
 */
export function ReferenceWizard({ characters, initialCharacterId, atLimit = false }: { characters: SheetCharacter[]; initialCharacterId?: string; atLimit?: boolean }) {
  const generation = useGeneration();
  const [list, setList] = useState(characters);
  // "" means a new persona (the default: this is usually the very first step of creating one).
  const [characterId, setCharacterId] = useState(() => {
    const wanted = characters.find((c) => c.id === initialCharacterId)?.id;
    return wanted ?? (atLimit ? (characters[0]?.id ?? "") : "");
  });
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [name, setName] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [facePhoto, pickFacePhoto] = usePhoto();
  const [faceSheetUpload, pickFaceSheetFile, setFaceSheetUpload] = usePhoto("face_sheet");
  const [bodySheetUpload, pickBodySheetFile] = usePhoto("body_sheet");
  const [body1, pickBody1] = usePhoto();
  const [body2, pickBody2] = usePhoto();
  const [body3, pickBody3] = usePhoto();
  // Sheets saved or made during this visit.
  const [saved, setSaved] = useState<Record<string, { face?: SheetImage; body?: SheetImage }>>({});
  const [madeFace, setMadeFace] = useState<{ id: string; url: string } | null>(null);
  const [opts, setOpts] = useState({ outfit: "covered" as "covered" | "bikini", other: "toggle" as "toggle" | "photo" | "custom", outfitText: "", gluteSize: "match", gluteShape: "match", cup: "match" });

  const character = list.find((c) => c.id === characterId) ?? null;
  const isNew = !character;
  const go = (n: number) => {
    setStep(n);
    setReached((r) => Math.max(r, n));
    setError(undefined);
    requestAnimationFrame(() => document.getElementById("wz-top")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const savedFace = character ? (saved[character.id]?.face ?? character.faceSheet) : null;
  const savedBody = character ? (saved[character.id]?.body ?? character.bodySheet) : null;
  // The face used for the body sheet: one she added, else the one made in step 2, else her saved sheet, else the photo.
  const face: { path?: string; generation?: string; preview?: string; isSheet: boolean } | null = faceSheetUpload?.path
    ? { path: faceSheetUpload.path, preview: faceSheetUpload.preview, isSheet: true }
    : madeFace
      ? { generation: madeFace.id, preview: madeFace.url, isSheet: true }
      : savedFace
        ? { path: savedFace.path, preview: savedFace.url, isSheet: true }
        : facePhoto?.path
          ? { path: facePhoto.path, preview: facePhoto.preview, isSheet: false }
          : null;
  const bodies = [body1, body2, body3].filter((b): b is Photo & { path: string } => !!b?.path);
  const bodyPaths = bodies.map((b) => b.path);

  const sheetOpts = {
    outfit: opts.other === "toggle" ? opts.outfit : opts.other,
    ...(opts.other === "custom" ? { outfitText: opts.outfitText.trim() } : {}),
    ...(opts.gluteSize !== "match" ? { gluteSize: opts.gluteSize } : {}),
    ...(opts.gluteShape !== "match" ? { gluteShape: opts.gluteShape } : {}),
    ...(opts.cup !== "match" ? { cup: opts.cup } : {}),
  };

  // Step 1 -> 2: a new persona is created now (just her name), so sheets can be made for her and saved.
  async function finishStep1() {
    setError(undefined);
    if (character) return go(2);
    setBusy(true);
    const r = await createPersona({ name, attested });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setList((l) => [...l, { id: r.id, name: r.name, faceSheet: null, bodySheet: null, photo: null }]);
    setCharacterId(r.id);
    // A refresh now resumes with her picked.
    window.history.replaceState(null, "", `/reference-sheet?character=${r.id}`);
    go(2);
  }

  const doneSheet = !!savedBody || !!bodySheetUpload?.path;
  const bodyAttach: AttachTile[] = [
    { tag: "@image1", label: face?.isSheet ? "her face sheet" : "her face photo", source: "ref", url: face?.preview },
    ...bodies.map((b, i) => ({ tag: `@image${i + 2}`, label: `body photo ${i + 1}`, source: "ref" as const, url: b.preview })),
  ];

  return (
    <div id="wz-top" className="mt-5 flex scroll-mt-20 flex-col gap-5 max-sm:mt-3 max-sm:gap-4">
      <div className="panel p-4 pb-3 max-sm:rounded-3xl max-sm:p-3">
        <Stepper step={step} reached={reached} onGo={go} />
      </div>

      {step === 1 && (
        <StepCard n={1} title="Start with her face" intro="Pick who you're making and add one clear, front-facing photo of her face. Everything else is built from it.">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wz-character">Persona</Label>
            <div className="sm:max-w-sm">
              <CharacterPicker
                id="wz-character"
                value={characterId}
                onChange={(id) => {
                  setCharacterId(id);
                  setError(undefined);
                }}
                none={atLimit ? undefined : { label: "New persona", note: "Start from scratch", symbol: "+" }}
                characters={list.map((c) => ({ id: c.id, name: c.name, photo: c.photo ?? c.faceSheet?.url ?? null }))}
              />
            </div>
            {atLimit && !list.length && <p className="text-sm text-amber-400">The free plan includes 1 character, and you&apos;re at it.</p>}
          </div>

          {isNew && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 sm:max-w-sm">
                <Label htmlFor="wz-name">Her name</Label>
                <Input id="wz-name" value={name} maxLength={80} placeholder="e.g. Holly" onChange={(e) => setName(e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm text-neutral-300">
                <input type="checkbox" className="mt-1" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
                I own or license any photos I use for her, or she&apos;s an invented character.
              </label>
            </div>
          )}

          <PhotoDrop
            title="Face photo"
            hint={isNew ? "A clear, front-facing photo. Click, drop, or paste." : `Optional: ${character?.name} already has ${savedFace ? "a saved face sheet" : "no face sheet"}. Add a photo to make a new one.`}
            photo={facePhoto}
            onPick={(f) => void pickFacePhoto(f)}
          />

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <Nav
            next={() => void finishStep1()}
            nextLabel={busy ? "Starting..." : isNew ? "Start her & continue" : "Continue"}
            nextDisabled={busy || facePhoto?.busy || (isNew ? !name.trim() || !attested || !facePhoto?.path : !facePhoto?.path && !savedFace)}
            note={isNew && (!name.trim() || !attested || !facePhoto?.path) ? "Add her name, tick the box and add a face photo to continue." : undefined}
          />
        </StepCard>
      )}

      {step === 2 && character && (
        <StepCard
          n={2}
          title="Make her face sheet"
          intro="One face photo becomes a clean sheet of the same face: straight and smiling, facing forward, at 45 degrees and in profile. It's the strict identity reference for everything that follows."
        >
          {generation ? (
            facePhoto?.path ? (
              <GenerateImage
                key={`face-${character.id}`}
                prompt="Face sheet"
                characterId={character.id}
                extraPaths={[facePhoto.path]}
                kind="reference_sheet"
                meta={{ sheet: { kind: "face" } }}
                aspectRatio={SHEET_ASPECT_RATIO.face}
                defaultResolution="2k"
                actionLabel="Make face sheet"
                renderActions={(r) => (
                  <>
                    <SaveSheet character={character} slot="face_sheet" generationId={r.generationId} current={savedFace} onSaved={(img) => setSaved((s) => ({ ...s, [character.id]: { ...s[character.id], face: img } }))} />
                    <UseAsFaceSheet generationId={r.generationId} url={r.url} onUse={setMadeFace} />
                  </>
                )}
              />
            ) : (
              <p className="text-sm text-amber-300">Add a face photo in step 1 to make a sheet from it, or add a finished sheet below.</p>
            )
          ) : (
            <PromptCard
              prompt={sheetPrompts(false, false).face}
              items={[{ tag: "@image1", label: "her face photo", source: "ref", url: facePhoto?.preview }]}
            />
          )}

          <div className="rounded-2xl border border-dashed border-neutral-700 p-3">
            <PhotoDrop
              title={generation ? "Or add a face sheet you already have" : "Got your finished face sheet? Add it here"}
              hint="It's saved as her face sheet, and used for her body sheet."
              photo={faceSheetUpload}
              onPick={(f) => void pickFaceSheetFile(f, character.id)}
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <Nav
            onBack={() => go(1)}
            next={() => go(3)}
            nextLabel={face?.isSheet ? "Continue" : "Skip face sheet"}
            nextDisabled={!face || faceSheetUpload?.busy}
            note={face?.isSheet ? undefined : "No face sheet yet: you can continue with your face photo, but a sheet keeps her face most consistent."}
          />
        </StepCard>
      )}

      {step === 3 && character && (
        <StepCard n={3} title="Add her body" intro={`Add one, two or three full-body photos (front, back or side) of the body you want ${character.name} to have. More angles hold her shape better.`}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 [&>*]:min-w-0">
            <PhotoDrop layout="tile" title="Body photo 1" hint="Front, back or side." photo={body1} onPick={(f) => void pickBody1(f)} />
            <PhotoDrop layout="tile" title="Body photo 2" hint="Optional: another angle." photo={body2} onPick={(f) => void pickBody2(f)} />
            <PhotoDrop layout="tile" title="Body photo 3" hint="Optional: another angle." photo={body3} onPick={(f) => void pickBody3(f)} />
          </div>
          <p className="-mt-1 text-xs text-neutral-500">Up to {MAX_BODY_PHOTOS} photos. Her face comes from {face?.isSheet ? "her face sheet" : "her face photo"}.</p>

          <details className="group rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-200">Fine-tune the sheet <span className="font-normal text-neutral-500">(outfit and body, optional)</span></summary>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
              <label className="flex flex-col gap-1.5 text-sm">
                Or a different outfit
                <select className={select} value={opts.other} onChange={(e) => setOpts((o) => ({ ...o, other: e.target.value as typeof o.other }))}>
                  {SHEET_OUTFITS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                Bust
                <select className={select} value={opts.cup} onChange={(e) => setOpts((o) => ({ ...o, cup: e.target.value }))}>
                  {CUPS.map((c) => <option key={c} value={c}>{c === "match" ? "As in the photos" : `${c} cup`}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                Glute size
                <select className={select} value={opts.gluteSize} onChange={(e) => setOpts((o) => ({ ...o, gluteSize: e.target.value }))}>
                  {GLUTE_SIZES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                Glute shape
                <select className={select} value={opts.gluteShape} onChange={(e) => setOpts((o) => ({ ...o, gluteShape: e.target.value }))}>
                  {GLUTE_SHAPES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
            </div>
            {opts.other === "custom" && (
              <label className="mt-3 flex flex-col gap-1.5 text-sm">
                The outfit
                <Textarea value={opts.outfitText} maxLength={500} onChange={(e) => setOpts((o) => ({ ...o, outfitText: e.target.value }))} placeholder="e.g. a black ribbed tank top and grey biker shorts, white sneakers" />
              </label>
            )}
          </details>

          <Nav
            onBack={() => go(2)}
            next={() => go(4)}
            nextLabel="Continue"
            nextDisabled={!bodies.length || [body1, body2, body3].some((b) => b?.busy)}
            note={!bodies.length ? "Add at least one body photo to continue." : undefined}
          />
        </StepCard>
      )}

      {step === 4 && character && (
        <StepCard
          n={4}
          title={generation ? "Make the reference sheet" : "Your reference sheet prompt"}
          intro={`${character.name}'s face from ${face?.isSheet ? "her face sheet" : "her photo"} goes onto the body in your photos, shown in four views: front, three-quarter, side and back.`}
        >
          <div className="flex flex-col gap-2" role="group" aria-label="Outfit for the sheet">
            <span className="text-sm text-neutral-300">Outfit in the sheet</span>
            <div className={segTrack}>
              {SHEET_LOOKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={opts.other === "toggle" && opts.outfit === l.id}
                  onClick={() => setOpts((o) => ({ ...o, outfit: l.id, other: "toggle" }))}
                  className={segItem(opts.other === "toggle" && opts.outfit === l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              {opts.other === "toggle" ? SHEET_LOOKS.find((l) => l.id === opts.outfit)?.hint : opts.other === "photo" ? "The outfit from body photo 1 (set in step 3's fine-tune options)." : "Your own outfit text (set in step 3's fine-tune options)."}
            </p>
          </div>
          {generation ? (
            face && bodies.length ? (
              <GenerateImage
                key={`body-${character.id}-${bodyPaths.join(",")}`}
                prompt="Face and body sheet"
                characterId={character.id}
                extraPaths={face.generation ? bodyPaths : [face.path as string, ...bodyPaths]}
                meta={{ sheet: { kind: "body", hasSheet: face.isSheet, ...sheetOpts }, ...(face.generation ? { sourceGeneration: face.generation } : {}) }}
                kind="reference_sheet"
                aspectRatio={SHEET_ASPECT_RATIO.body}
                defaultResolution="2k"
                actionLabel="Make face and body sheet"
                renderActions={(r) => (
                  <SaveSheet character={character} slot="body_sheet" generationId={r.generationId} current={savedBody} onSaved={(img) => setSaved((s) => ({ ...s, [character.id]: { ...s[character.id], body: img } }))} />
                )}
              />
            ) : (
              <p className="text-sm text-amber-300">Go back and add a face and at least one body photo first.</p>
            )
          ) : (
            <>
              <PromptCard prompt={sheetPrompts(!!face?.isSheet, bodies.length || 1, sheetOpts).body} items={bodyAttach} />
              <div className="rounded-2xl border border-dashed border-neutral-700 p-3">
                <PhotoDrop
                  title="Made it? Add the finished sheet here"
                  hint={`It's saved as ${character.name}'s body sheet.`}
                  photo={bodySheetUpload}
                  onPick={(f) => void pickBodySheetFile(f, character.id)}
                />
              </div>
            </>
          )}

          {doneSheet && (
            <div role="status" className="animate-pop-in rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <p className="font-display text-lg font-bold text-emerald-200">{character.name} is ready</p>
              <p className="mt-1 text-sm text-neutral-300">Her face and body sheets are saved. They go first with every prompt you write for her.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/inject?character=${character.id}`} className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-95">
                  Put her in a photo
                </Link>
                <Link href={`/characters/${character.id}`} className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-500">
                  Open her profile
                </Link>
              </div>
            </div>
          )}

          <Nav onBack={() => go(3)} next={() => (window.location.href = "/reference-sheet")} nextLabel="Make another persona" />
        </StepCard>
      )}
    </div>
  );
}
