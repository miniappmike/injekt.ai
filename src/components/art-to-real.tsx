"use client";

import { useState } from "react";
import { useGeneration } from "@/components/app-context";
import { CharacterPicker } from "@/components/character-picker";
import { CopyOpen } from "@/components/copy-open";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { artToRealText } from "@/app/(app)/art-to-real/actions";

type Photo = { preview: string; path?: string; error?: string; busy?: boolean };
export interface ArtCharacter {
  id: string;
  name: string;
  photo: string | null;
  ready: boolean;
}

/**
 * Art to Real: an artwork, anime or any non-photo image becomes a realistic photo. Importing one of your characters is
 * optional; with none, the woman in the artwork is made real as she is.
 */
export function ArtToReal({ characters }: { characters: ArtCharacter[] }) {
  const generation = useGeneration();
  const [art, setArt] = useState<Photo | null>(null);
  const [characterId, setCharacterId] = useState("");
  const [direction, setDirection] = useState("");
  const [written, setWritten] = useState<{ busy?: boolean; text?: string; attach?: { label: string; url: string | null }[]; error?: string }>({});
  const character = characters.find((c) => c.id === characterId) ?? null;

  async function pick(file: File) {
    setArt({ preview: URL.createObjectURL(file), busy: true });
    setWritten({});
    try {
      const path = await uploadImage(file, "target");
      setArt({ preview: URL.createObjectURL(file), path });
    } catch (e) {
      setArt({ preview: URL.createObjectURL(file), error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function write() {
    setWritten({ busy: true });
    const r = await artToRealText({ characterId: characterId || null, direction });
    setWritten(r.ok ? { text: r.text, attach: r.attach } : { error: r.error });
  }

  const notReady = character && !character.ready;
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-sm:p-4">
        <section className="flex flex-col gap-2">
          <Label className="font-display text-base font-bold text-neutral-50">1. Your artwork</Label>
          <ImageDrop
            layout="tile"
            title="Artwork"
            hint="Anime, a drawing, a render, any non-photo image. Click, drop, or paste."
            preview={art?.preview}
            disabled={art?.busy}
            onPick={(f) => void pick(f)}
          />
          {art?.error && <p role="alert" className="text-sm text-red-400">{art.error}</p>}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="art-character" className="font-display text-base font-bold text-neutral-50">
              2. Character <span className="text-sm font-normal text-neutral-500">(optional)</span>
            </Label>
            <CharacterPicker
              id="art-character"
              value={characterId}
              onChange={(id) => {
                setCharacterId(id);
                setWritten({});
              }}
              characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "No images yet" }))}
              none={{ label: "No character", note: "Make the woman in the artwork real", symbol: "✦" }}
            />
            <p className="text-xs text-neutral-500">
              {character ? `${character.name}'s face, hair and body replace the drawn woman's; the pose, outfit and setting come from the artwork.` : "Leave it on No character to turn the artwork itself into a real woman."}
            </p>
            {notReady && <p className="text-sm text-amber-300">{character!.name} has no reference images yet. Add a sheet on her page, or choose No character.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="art-direction" className="text-sm text-neutral-200">
              Anything to change? <span className="text-neutral-500">(optional)</span>
            </Label>
            <Textarea
              id="art-direction"
              rows={2}
              maxLength={600}
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setWritten({});
              }}
              placeholder="e.g. a bedroom with warm lamp light, her top in black"
            />
          </div>
        </section>
      </div>

      {art?.path && !notReady && (
        <div className="panel flex flex-col gap-3 p-5 max-sm:p-4">
          {generation ? (
            <GenerateImage
              key={`${art.path}|${characterId}`}
              kind="art_to_real"
              prompt="Art to Real"
              characterId={characterId || null}
              extraPaths={[art.path]}
              meta={direction.trim() ? { extra: direction.trim() } : undefined}
              actionLabel="Make it real"
              defaultResolution="1.5k"
              checkLikeness={!!characterId}
            />
          ) : written.text ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Attach these in your generator, in this order</p>
              <ol className="flex flex-wrap items-start gap-3">
                <li className="flex w-24 flex-col items-center gap-1 text-center text-[11px] text-neutral-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={art.preview} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-white/10" />
                  @image1 · your artwork
                </li>
                {written.attach?.map((a, i) => (
                  <li key={i} className="flex w-24 flex-col items-center gap-1 text-center text-[11px] text-neutral-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.url ? <img src={a.url} alt="" className="h-24 w-24 rounded-lg object-cover object-top ring-1 ring-white/10" /> : <span className="h-24 w-24 rounded-lg bg-neutral-800" />}
                    <span className="line-clamp-2">@image{i + 2} · {a.label}</span>
                  </li>
                ))}
              </ol>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-sans text-sm text-neutral-300">{written.text}</pre>
              <CopyOpen text={written.text} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={write} disabled={written.busy}>{written.busy ? "Writing..." : "Write prompt"}</Button>
              {written.error && <p role="alert" className="text-sm text-red-400">{written.error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
