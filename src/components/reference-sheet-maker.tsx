"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { saveReferenceSheet } from "@/app/(app)/reference-sheet/actions";
import { CUPS, GLUTE_SHAPES, GLUTE_SIZES, SHEET_ASPECT_RATIO, SHEET_OUTFITS } from "@/lib/sheet-options";
import { Textarea } from "@/components/ui/textarea";
import type { SheetSlot } from "@/lib/reference-sheet";

export interface SheetImage {
  path: string;
  url: string;
}
export interface SheetCharacter {
  id: string;
  name: string;
  faceSheet: SheetImage | null;
  bodySheet: SheetImage | null;
}

type Photo = { preview: string; path?: string; error?: string; busy?: boolean };

// One uploaded photo: shows it straight away, then holds the stored path once the upload is done.
function usePhoto() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  async function pick(file: File) {
    const preview = URL.createObjectURL(file);
    setPhoto({ preview, busy: true });
    try {
      setPhoto({ preview, path: await uploadImage(file, "target") });
    } catch (e) {
      setPhoto({ preview, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }
  return [photo, pick] as const;
}

function PhotoDrop({ title, hint, photo, onPick }: { title: string; hint: string; photo: Photo | null; onPick: (f: File) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <ImageDrop title={title} hint={hint} preview={photo?.preview} disabled={photo?.busy} onPick={onPick} />
      {photo?.busy && <p className="text-xs text-neutral-500">Uploading...</p>}
      {photo?.error && <p role="alert" className="text-sm text-red-400">{photo.error}</p>}
    </div>
  );
}

// Under a finished sheet: make it the character's face or body sheet. The old one is replaced, so ask first.
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

  if (state.saved) {
    return (
      <p role="status" className="text-sm text-emerald-300">
        Saved. It&apos;s now {character.name}&apos;s {noun}, and goes first with every generation.{" "}
        <Link href={`/characters/${character.id}`} className="underline">Open {character.name}</Link>
      </p>
    );
  }
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

// Hands a finished step-1 sheet to step 2 as soon as it's ready (artifact: the result fills the step-2 face slot).
function UseInStep2({ generationId, url, onUse }: { generationId: string; url: string; onUse: (sheet: { id: string; url: string }) => void }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onUse({ id: generationId, url });
  }, [generationId, url, onUse]);
  return <p className="text-xs text-neutral-500">Added to step 2 as her face sheet.</p>;
}

const select = "h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm";

// Step 1 turns one face photo into a 3x3 face sheet. Step 2 turns that face sheet and one or two body photos into a face
// and body sheet. Each result can be saved onto a character, where it becomes the first image sent with every generation.
export function ReferenceSheetMaker({
  characters,
  initialCharacterId,
  freeImagesLeft,
}: {
  characters: SheetCharacter[];
  initialCharacterId?: string;
  freeImagesLeft: number | null;
}) {
  const [characterId, setCharacterId] = useState(characters.find((c) => c.id === initialCharacterId)?.id ?? characters[0]?.id ?? "");
  // Sheets saved during this visit, so step 2 can use the face sheet you have just saved.
  const [saved, setSaved] = useState<Record<string, { face?: SheetImage; body?: SheetImage }>>({});
  const [facePhoto, pickFacePhoto] = usePhoto();
  const [faceSheetUpload, pickFaceSheet] = usePhoto();
  const [body1, pickBody1] = usePhoto();
  const [body2, pickBody2] = usePhoto();
  // A face sheet just made in step 1, used in step 2 without saving it first.
  const [step1Sheets, setStep1Sheets] = useState<Record<string, { id: string; url: string }>>({});
  const [opts, setOpts] = useState({ outfit: "default" as "default" | "photo" | "custom", outfitText: "", gluteSize: "match", gluteShape: "match", cup: "match" });

  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return (
      <p className="mt-6 text-neutral-400">
        You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
      </p>
    );
  }

  const savedFace = saved[character.id]?.face ?? character.faceSheet;
  // Only a sheet made for this character is used for her step 2.
  const step1Sheet = step1Sheets[character.id] ?? null;
  const setStep1Sheet = (sheet: { id: string; url: string }) => setStep1Sheets((m) => ({ ...m, [character.id]: sheet }));
  const savedBody = saved[character.id]?.body ?? character.bodySheet;
  const remember = (key: "face" | "body") => (image: SheetImage) => setSaved((s) => ({ ...s, [character.id]: { ...s[character.id], [key]: image } }));

  // Step 2's face: a sheet uploaded there, else the one just made in step 1, else her saved one, else the step-1 photo.
  const face: { path?: string; generation?: string; isSheet: boolean } | null = faceSheetUpload
    ? { path: faceSheetUpload.path, isSheet: true }
    : step1Sheet
      ? { generation: step1Sheet.id, isSheet: true }
      : savedFace
        ? { path: savedFace.path, isSheet: true }
        : facePhoto?.path
          ? { path: facePhoto.path, isSheet: false }
          : null;
  const faceReady = !!face && (!!face.path || !!face.generation);
  const bodyPaths = [body1?.path, body2?.path].filter((p): p is string => !!p);
  const bodyReady = faceReady && bodyPaths.length > 0;
  const missingForBody = !faceReady && !bodyPaths.length ? "a face sheet and at least one body photo" : !faceReady ? "a face sheet or a face photo in step 1" : "at least one body photo";
  const sheetOpts = {
    outfit: opts.outfit,
    ...(opts.outfit === "custom" ? { outfitText: opts.outfitText.trim() } : {}),
    ...(opts.gluteSize !== "match" ? { gluteSize: opts.gluteSize } : {}),
    ...(opts.gluteShape !== "match" ? { gluteShape: opts.gluteShape } : {}),
    ...(opts.cup !== "match" ? { cup: opts.cup } : {}),
  };

  return (
    <div className="mt-6 flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <Label htmlFor="rs-character">Character</Label>
        <select
          id="rs-character"
          value={character.id}
          onChange={(e) => setCharacterId(e.target.value)}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-xs text-neutral-500">Sheets you make are saved to this character.</p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="rs-step1">
        <div>
          <h2 id="rs-step1" className="text-lg font-semibold">Step 1 · Face sheet <span className="text-sm font-normal text-neutral-500">(optional)</span></h2>
          <p className="text-sm text-neutral-400">One clear face photo becomes a 3×3 sheet of the same face from nine angles.</p>
        </div>
        <PhotoDrop title="Face photo" hint="A clear, front-facing photo. Click, drop, or paste with Ctrl+V." photo={facePhoto} onPick={pickFacePhoto} />
        <GenerateImage
          key={`face-${character.id}`}
          prompt="Face sheet"
          characterId={character.id}
          extraPaths={facePhoto?.path ? [facePhoto.path] : []}
          kind="reference_sheet"
          meta={facePhoto?.path ? { sheet: { kind: "face" } } : undefined}
          freeImagesLeft={freeImagesLeft}
          aspectRatio={SHEET_ASPECT_RATIO.face}
          defaultResolution="2k"
          actionLabel="Make face sheet"
          renderActions={(r) => (
            <>
              <SaveSheet character={character} slot="face_sheet" generationId={r.generationId} current={savedFace} onSaved={remember("face")} />
              <UseInStep2 generationId={r.generationId} url={r.url} onUse={setStep1Sheet} />
            </>
          )}
        />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="rs-step2">
        <div>
          <h2 id="rs-step2" className="text-lg font-semibold">Step 2 · Face and body sheet</h2>
          <p className="text-sm text-neutral-400">
            The face sheet plus one or two body photos (front, back or side) become one sheet with the face above the body from the front, side and back.
          </p>
        </div>
        <PhotoDrop
          title="Face sheet"
          hint={
            faceSheetUpload
              ? "Using the sheet you added here."
              : savedFace
                ? `Using ${character.name}'s saved face sheet. Replace it to use a different one.`
                : "Make one in step 1 and save it, or add one here."
          }
          photo={faceSheetUpload ?? (step1Sheet ? { preview: step1Sheet.url } : savedFace ? { preview: savedFace.url, path: savedFace.path } : null)}
          onPick={pickFaceSheet}
        />
        {!faceSheetUpload && step1Sheet && <p className="-mt-2 text-xs text-neutral-500">Using the face sheet you just made in step 1.</p>}
        {!faceSheetUpload && !step1Sheet && !savedFace && facePhoto?.path && <p className="-mt-2 text-xs text-neutral-500">Using your step 1 face photo.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <PhotoDrop title="Body photo 1" hint="Front, back or side." photo={body1} onPick={pickBody1} />
          <PhotoDrop title="Body photo 2 (optional)" hint="A different angle, if you have one." photo={body2} onPick={pickBody2} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            Outfit in the body views
            <select className={select} value={opts.outfit} onChange={(e) => setOpts((o) => ({ ...o, outfit: e.target.value as typeof o.outfit }))}>
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
        {opts.outfit === "custom" && (
          <label className="flex flex-col gap-1.5 text-sm">
            The outfit
            <Textarea value={opts.outfitText} maxLength={500} onChange={(e) => setOpts((o) => ({ ...o, outfitText: e.target.value }))} placeholder="e.g. a black ribbed tank top and grey biker shorts, white sneakers" />
          </label>
        )}
        {!bodyReady && <p className="text-xs text-neutral-500">Add {missingForBody} to make the sheet.</p>}
        <GenerateImage
          key={`body-${character.id}`}
          prompt="Face and body sheet"
          characterId={character.id}
          extraPaths={bodyReady ? (face?.generation ? bodyPaths : [face?.path as string, ...bodyPaths]) : []}
          meta={bodyReady ? { sheet: { kind: "body", hasSheet: face?.isSheet, ...sheetOpts }, ...(face?.generation ? { sourceGeneration: face.generation } : {}) } : undefined}
          kind="reference_sheet"
          freeImagesLeft={freeImagesLeft}
          aspectRatio={SHEET_ASPECT_RATIO.body}
          defaultResolution="2k"
          actionLabel="Make face and body sheet"
          renderActions={(r) => (
            <SaveSheet character={character} slot="body_sheet" generationId={r.generationId} current={savedBody} onSaved={remember("body")} />
          )}
        />
      </section>
    </div>
  );
}
