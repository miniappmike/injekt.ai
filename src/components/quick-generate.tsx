"use client";

import Link from "next/link";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { directSwapPrompt } from "@/lib/ai/tasks/direct-swap";

export interface QuickCharacter {
  id: string;
  name: string;
  /** How many reference images the character has (they go first, as @image1...). */
  refCount: number;
}

// "Direct swap" puts the character into a photo with a fixed prompt. "Edit" sends your own prompt as it is.
// Both use the character's references first and the photo last, and need no AI step to write a prompt.
export function QuickGenerate({
  mode,
  characters,
  freeImagesLeft,
}: {
  mode: "direct_swap" | "edit";
  characters: QuickCharacter[];
  freeImagesLeft: number | null;
}) {
  const [characterId, setCharacterId] = useState(characters.find((c) => c.refCount > 0)?.id ?? characters[0]?.id ?? "");
  const [photo, setPhoto] = useState<{ preview: string; path?: string; error?: string; busy?: boolean } | null>(null);
  const [editPrompt, setEditPrompt] = useState("");

  const character = characters.find((c) => c.id === characterId);
  const refCount = character?.refCount ?? 0;
  const prompt = mode === "direct_swap" ? (refCount > 0 ? directSwapPrompt(refCount) : "") : editPrompt;

  async function pick(file: File) {
    const preview = URL.createObjectURL(file);
    setPhoto({ preview, busy: true });
    try {
      setPhoto({ preview, path: await uploadImage(file, "target") });
    } catch (e) {
      setPhoto({ preview, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  if (!characters.length) {
    return (
      <p className="mt-6 text-neutral-400">
        You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label htmlFor="qg-character">Character</Label>
        <select
          id="qg-character"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.refCount ? "" : " (no images yet)"}</option>
          ))}
        </select>
        {refCount === 0 && character && (
          <p className="text-sm text-amber-400">
            Add a face sheet, body sheet or reference photo on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
          </p>
        )}
      </section>

      <ImageDrop title="Target photo" preview={photo?.preview} disabled={photo?.busy} onPick={pick} hint="The photo to put your character into. Click, drop, or paste with Ctrl+V." />
      {photo?.busy && <p className="-mt-4 text-xs text-neutral-500">Uploading...</p>}
      {photo?.error && <p role="alert" className="-mt-4 text-sm text-red-400">{photo.error}</p>}

      {mode === "direct_swap" ? (
        <section className="flex flex-col gap-2">
          <Label>Prompt</Label>
          <p className="whitespace-pre-wrap rounded-md border border-neutral-800 p-3 text-sm text-neutral-300">
            {prompt || "Pick a character with reference images."}
          </p>
          <p className="text-xs text-neutral-500">Sent as it is, with the character&apos;s references first and your photo last. For a prompt tailored to the photo, use Write prompts.</p>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <Label htmlFor="qg-prompt">Your prompt</Label>
          <Textarea id="qg-prompt" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} maxLength={5000} rows={5} />
          <p className="text-xs text-neutral-500">
            Refer to the images as @image1, @image2 and so on: the character&apos;s {refCount || "reference"} image{refCount === 1 ? "" : "s"} come first
            {refCount ? ` (@image1${refCount > 1 ? ` to @image${refCount}` : ""})` : ""}, then your photo{refCount ? ` (@image${refCount + 1})` : ""}.
          </p>
        </section>
      )}

      <GenerateImage
        prompt={prompt}
        characterId={characterId || null}
        extraPaths={photo?.path ? [photo.path] : []}
        kind={mode}
        freeImagesLeft={freeImagesLeft}
      />
    </div>
  );
}
