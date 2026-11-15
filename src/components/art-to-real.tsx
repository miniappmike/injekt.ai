"use client";

import { useRef, useState } from "react";
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
import { tokenGate } from "@/components/out-of-tokens";
import { staggerDelay } from "@/lib/stagger";

type Photo = { id: string; preview: string; path?: string; error?: string; busy?: boolean };
/** How many artworks can be imported (and made real) at once. */
export const MAX_ARTWORKS = 5;
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
  const [arts, setArts] = useState<Photo[]>([]);
  // Mirrors `arts` so several files picked in the same moment still respect the limit.
  const artsRef = useRef<Photo[]>([]);
  const [notice, setNotice] = useState<string>();
  // Goes up by one each time "Generate make real" is pressed; every artwork that hasn't run yet starts, staggered.
  const [runAll, setRunAll] = useState(0);
  const [characterId, setCharacterId] = useState("");
  const [direction, setDirection] = useState("");
  const [written, setWritten] = useState<{ busy?: boolean; text?: string; attach?: { label: string; url: string | null }[]; error?: string }>({});
  const character = characters.find((c) => c.id === characterId) ?? null;

  function commit(next: Photo[]) {
    artsRef.current = next;
    setArts(next);
  }
  const patch = (id: string, change: Partial<Photo>) => commit(artsRef.current.map((a) => (a.id === id ? { ...a, ...change } : a)));

  async function pick(file: File) {
    if (artsRef.current.length >= MAX_ARTWORKS) {
      setNotice(`You can import up to ${MAX_ARTWORKS} artworks at once. Remove one to add another.`);
      return;
    }
    setNotice(undefined);
    const id = crypto.randomUUID();
    commit([...artsRef.current, { id, preview: URL.createObjectURL(file), busy: true }]);
    setWritten({});
    try {
      patch(id, { path: await uploadImage(file, "target"), busy: false });
    } catch (e) {
      patch(id, { error: e instanceof Error ? e.message : "Upload failed", busy: false });
    }
  }

  function remove(id: string) {
    const gone = artsRef.current.find((a) => a.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    setNotice(undefined);
    setWritten({});
    commit(artsRef.current.filter((a) => a.id !== id));
  }

  async function write() {
    setWritten({ busy: true });
    const r = await artToRealText({ characterId: characterId || null, direction });
    setWritten(r.ok ? { text: r.text, attach: r.attach } : { error: tokenGate(r.error) });
  }

  const ready = arts.filter((a) => a.path);
  const notReady = character && !character.ready;
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-sm:p-4">
        <section className="flex flex-col gap-2">
          <Label className="font-display text-base font-bold text-neutral-50">
            1. Your artwork <span className="text-sm font-normal text-neutral-500">(up to {MAX_ARTWORKS})</span>
          </Label>
          <ImageDrop
            layout="tile"
            multiple
            full={arts.length >= MAX_ARTWORKS}
            title={arts.length >= MAX_ARTWORKS ? `${MAX_ARTWORKS}/${MAX_ARTWORKS} artworks` : arts.length ? `Add more (${arts.length}/${MAX_ARTWORKS})` : "Artwork"}
            hint={arts.length >= MAX_ARTWORKS ? "Remove one to add another." : "Anime, a drawing, a render, any non-photo image. Pick up to 5 at once, drop, or paste."}
            onPick={(f) => void pick(f)}
            gallery={
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {arts.map((a, i) => (
                  <li key={a.id} className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.preview} alt={`Artwork ${i + 1}`} className={`h-full w-full object-cover ${a.busy ? "opacity-50" : ""}`} />
                    {a.busy && <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">Uploading...</span>}
                    {a.error && <span className="absolute inset-x-0 bottom-0 bg-red-950/90 px-1 py-0.5 text-center text-[10px] text-red-200">{a.error}</span>}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(a.id);
                      }}
                      aria-label={`Remove artwork ${i + 1}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white transition-colors hover:bg-black"
                    >
                      ×
                    </button>
                  </li>
                ))}
                {Array.from({ length: MAX_ARTWORKS - arts.length }, (_, i) => (
                  <li key={`empty-${i}`} className="flex aspect-square items-center justify-center rounded-lg bg-neutral-950/50 text-neutral-600 transition-colors group-hover:text-brand-400">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  </li>
                ))}
              </ul>
            }
          />
          {notice && <p role="alert" className="text-sm text-amber-300">{notice}</p>}
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

      {ready.length > 0 && !notReady && (
        <div className="panel flex flex-col gap-3 p-5 max-sm:p-4">
          {generation ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="max-sm:h-11 max-sm:w-full max-sm:text-[15px]"
                  onClick={() => {
                    const n = ready.length;
                    if (n > 1 && !window.confirm(`Make Real (${n})? They start one every 5 seconds; each one's price is shown on its own button below.`)) return;
                    setRunAll((v) => v + 1);
                  }}
                >
                  Make Real{ready.length > 1 ? ` (${ready.length})` : ""}
                </Button>
                {ready.length > 1 && <p className="text-xs text-neutral-500">Starts every artwork below, one every 5 seconds. Or press Make Real on just one.</p>}
              </div>
              <div className="flex flex-col gap-4">
                {ready.map((a, i) => (
                  <div key={a.id} className="flex flex-col gap-1 border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2 text-sm text-neutral-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.preview} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-white/10" />
                      Artwork {arts.indexOf(a) + 1}
                    </div>
                    <GenerateImage
                      key={`${a.path}|${characterId}`}
                      kind="art_to_real"
                      prompt="Art to Real"
                      characterId={characterId || null}
                      extraPaths={[a.path!]}
                      meta={direction.trim() ? { extra: direction.trim() } : undefined}
                      actionLabel="Make Real"
                      defaultResolution="1.5k"
                      checkLikeness={!!characterId}
                      runSignal={runAll}
                      runDelayMs={staggerDelay(i)}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : written.text ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Attach these in your generator, in this order</p>
              <ol className="flex flex-wrap items-start gap-3">
                <li className="flex w-24 flex-col items-center gap-1 text-center text-[11px] text-neutral-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ready[0].preview} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-white/10" />
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
              {ready.length > 1 && <p className="text-xs text-neutral-500">The same prompt works for each artwork: swap @image1 for the next one.</p>}
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-sans text-sm text-neutral-300">{written.text}</pre>
              <CopyOpen text={written.text} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" className="max-sm:h-11 max-sm:w-full max-sm:text-[15px]" onClick={write} disabled={written.busy}>{written.busy ? "Writing..." : "Write prompt"}</Button>
              {written.error && <p role="alert" className="text-sm text-red-400">{written.error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
