"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { saveReferenceSheet } from "@/app/(app)/reference-sheet/actions";
import { bodySheetPrompt, faceSheetPrompt, SHEET_ASPECT_RATIO } from "@/lib/ai/tasks/reference-sheet";
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

  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return (
      <p className="mt-6 text-neutral-400">
        You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
      </p>
    );
  }

  const savedFace = saved[character.id]?.face ?? character.faceSheet;
  const savedBody = saved[character.id]?.body ?? character.bodySheet;
  const remember = (key: "face" | "body") => (image: SheetImage) => setSaved((s) => ({ ...s, [character.id]: { ...s[character.id], [key]: image } }));

  // Step 2's face sheet is the one you upload there, otherwise the character's saved one.
  const facePath = faceSheetUpload?.path ?? (faceSheetUpload ? undefined : savedFace?.path);
  const bodyPaths = [body1?.path, body2?.path].filter((p): p is string => !!p);
  const bodyReady = !!facePath && bodyPaths.length > 0;
  const missingForBody = !facePath && !bodyPaths.length ? "a face sheet and at least one body photo" : !facePath ? "a face sheet" : "at least one body photo";

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
          prompt={faceSheetPrompt()}
          characterId={character.id}
          extraPaths={facePhoto?.path ? [facePhoto.path] : []}
          kind="reference_sheet"
          freeImagesLeft={freeImagesLeft}
          aspectRatio={SHEET_ASPECT_RATIO.face}
          defaultResolution="2k"
          actionLabel="Make face sheet"
          renderActions={(r) => (
            <SaveSheet character={character} slot="face_sheet" generationId={r.generationId} current={savedFace} onSaved={remember("face")} />
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
          photo={faceSheetUpload ?? (savedFace ? { preview: savedFace.url, path: savedFace.path } : null)}
          onPick={pickFaceSheet}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PhotoDrop title="Body photo 1" hint="Front, back or side." photo={body1} onPick={pickBody1} />
          <PhotoDrop title="Body photo 2 (optional)" hint="A different angle, if you have one." photo={body2} onPick={pickBody2} />
        </div>
        {!bodyReady && <p className="text-xs text-neutral-500">Add {missingForBody} to make the sheet.</p>}
        <GenerateImage
          key={`body-${character.id}`}
          prompt={bodyReady ? bodySheetPrompt(bodyPaths.length) : ""}
          characterId={character.id}
          extraPaths={bodyReady ? [facePath as string, ...bodyPaths] : []}
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
