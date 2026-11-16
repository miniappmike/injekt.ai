"use client";

import { useEffect, useRef, useState } from "react";
import { getDraftFiles, putDraftFiles, readDraft, useDraftState, writeDraft } from "@/lib/drafts";
import { useGeneration } from "@/components/app-context";
import { CharacterPicker } from "@/components/character-picker";
import { CopyOpen } from "@/components/copy-open";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { segItem, segTrack } from "@/components/ui/segmented";
import { planUgc } from "@/app/(app)/ugc/actions";
import { tokenGate } from "@/components/out-of-tokens";
import { staggerDelay } from "@/lib/stagger";
import { DEFAULT_UGC_SHOTS, MAX_PRODUCT_PHOTOS, MAX_UGC_NOTE, MAX_UGC_SHOTS, type UgcProduct, type UgcShot } from "@/lib/ugc-meta";

type Photo = { id: string; preview: string; path?: string; error?: string; busy?: boolean };
type Plan = { id: string; product: UgcProduct; shots: (UgcShot & { prompt: string })[]; attach: string[]; paths: string[]; characterId: string };

export interface UgcCharacter {
  id: string;
  name: string;
  photo: string | null;
  ready: boolean;
}

/**
 * UGC: product photos and a character in, photos of her showing the product off out. One press reads the product,
 * plans a scene that fits it and starts the images.
 */
export function UgcTool({ characters, initialCharacterId }: { characters: UgcCharacter[]; initialCharacterId?: string }) {
  const generation = useGeneration();
  const [products, setProducts] = useState<Photo[]>([]);
  // Mirrors `products` so several files picked in the same moment still respect the limit.
  const productsRef = useRef<Photo[]>([]);
  const [notice, setNotice] = useState<string>();
  // The character, the choices and the product photos come back if the phone closes the app (see src/lib/drafts.ts).
  const [characterId, setCharacterId] = useDraftState("ugc.character", initialCharacterId ?? "", {
    decode: (v) => (!initialCharacterId && characters.some((c) => c.id === v) ? (v as string) : null),
  });
  const [count, setCount] = useDraftState("ugc.count", DEFAULT_UGC_SHOTS, { decode: (v) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_UGC_SHOTS ? (v as number) : null) });
  const [note, setNote] = useDraftState("ugc.note", "", { decode: (v) => (typeof v === "string" ? v.slice(0, MAX_UGC_NOTE) : null) });
  const files = useRef(new Map<string, File>());
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    void (async () => {
      const kept = await getDraftFiles("ugc");
      const paths = readDraft<Record<string, string>>("ugc.paths") ?? {};
      // Only photos that had finished uploading come back: their stored copy is what Generate sends.
      const back = kept.filter((k) => paths[k.id]).slice(0, MAX_PRODUCT_PHOTOS);
      if (back.length && !productsRef.current.length) {
        for (const k of back) files.current.set(k.id, k.file);
        commit(back.map((k) => ({ id: k.id, preview: URL.createObjectURL(k.file), path: paths[k.id] })));
      }
      setRestored(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const uploaded = products.filter((p) => p.path);
  const uploadedKey = uploaded.map((p) => p.id).join(",");
  useEffect(() => {
    if (!restored) return;
    void putDraftFiles("ugc", uploaded.flatMap((p) => (files.current.has(p.id) ? [{ id: p.id, file: files.current.get(p.id)! }] : [])));
    writeDraft("ugc.paths", uploaded.length ? Object.fromEntries(uploaded.map((p) => [p.id, p.path])) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, uploadedKey]);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string>();
  // Goes up once per plan, after its cards are on the page, so every shot starts (staggered) without another press.
  const [runAll, setRunAll] = useState(0);
  useEffect(() => {
    if (plan && generation) setRunAll((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  const character = characters.find((c) => c.id === characterId) ?? null;

  function commit(next: Photo[]) {
    productsRef.current = next;
    setProducts(next);
  }
  const patch = (id: string, change: Partial<Photo>) => commit(productsRef.current.map((p) => (p.id === id ? { ...p, ...change } : p)));

  async function pick(file: File) {
    if (productsRef.current.length >= MAX_PRODUCT_PHOTOS) {
      setNotice(`You can add up to ${MAX_PRODUCT_PHOTOS} product photos. Remove one to add another.`);
      return;
    }
    setNotice(undefined);
    const id = crypto.randomUUID();
    files.current.set(id, file);
    commit([...productsRef.current, { id, preview: URL.createObjectURL(file), busy: true }]);
    try {
      patch(id, { path: await uploadImage(file, "target"), busy: false });
    } catch (e) {
      patch(id, { error: e instanceof Error ? e.message : "Upload failed", busy: false });
    }
  }

  function remove(id: string) {
    const gone = productsRef.current.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    setNotice(undefined);
    commit(productsRef.current.filter((p) => p.id !== id));
  }

  /** Reads the product and plans the shots. `fresh` asks for scenes unlike the ones already shown. */
  async function run(fresh = false) {
    const paths = uploaded.map((p) => p.path!);
    if (!paths.length || !characterId) return;
    setPlanning(true);
    setError(undefined);
    const r = await planUgc({ productPaths: paths, characterId, shots: count, note, avoid: fresh && plan ? plan.shots.map((s) => s.title) : undefined }).catch(
      (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Couldn't plan the photo. Try again." }),
    );
    setPlanning(false);
    if (!r.ok) return setError(tokenGate(r.error));
    setPlan({ id: crypto.randomUUID(), product: r.product, shots: r.shots, attach: r.attach, paths, characterId });
  }

  const uploading = products.some((p) => p.busy);
  const notReady = !!character && !character.ready;
  const canRun = uploaded.length > 0 && !!character && !notReady && !uploading && !planning;
  const verb = generation ? "Generate UGC" : "Write UGC prompt";
  // The plan on screen was made for other photos or another character: it still shows, marked as out of date.
  const stale = !!plan && (plan.characterId !== characterId || plan.paths.join("|") !== uploaded.map((p) => p.path).join("|"));

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="panel grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-sm:p-4">
        <section className="flex flex-col gap-2">
          <Label className="font-display text-base font-bold text-neutral-50">
            1. Your product <span className="text-sm font-normal text-neutral-500">(up to {MAX_PRODUCT_PHOTOS} photos)</span>
          </Label>
          <ImageDrop
            layout="tile"
            multiple
            full={products.length >= MAX_PRODUCT_PHOTOS}
            title={products.length >= MAX_PRODUCT_PHOTOS ? `${MAX_PRODUCT_PHOTOS}/${MAX_PRODUCT_PHOTOS} photos` : products.length ? `Add another angle (${products.length}/${MAX_PRODUCT_PHOTOS})` : "Product photo"}
            hint={products.length >= MAX_PRODUCT_PHOTOS ? "Remove one to add another." : "A clear photo of the product on its own works best. Add more angles of the same product if you have them. Pick, drop, or paste."}
            onPick={(f) => void pick(f)}
            gallery={
              <ul className="grid grid-cols-4 gap-2">
                {products.map((p, i) => (
                  <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt={`Product photo ${i + 1}`} className={`h-full w-full object-cover ${p.busy ? "opacity-50" : ""}`} />
                    {p.busy && <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">Uploading...</span>}
                    {p.error && <span className="absolute inset-x-0 bottom-0 bg-red-950/90 px-1 py-0.5 text-center text-[10px] text-red-200">{p.error}</span>}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.id);
                      }}
                      aria-label={`Remove product photo ${i + 1}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white transition-colors hover:bg-black"
                    >
                      ×
                    </button>
                  </li>
                ))}
                {Array.from({ length: MAX_PRODUCT_PHOTOS - products.length }, (_, i) => (
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
            <Label htmlFor="ugc-character" className="font-display text-base font-bold text-neutral-50">
              2. Character
            </Label>
            {characters.length ? (
              <CharacterPicker
                id="ugc-character"
                value={characterId}
                onChange={setCharacterId}
                characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "No images yet" }))}
                none={{ label: "Pick a character", note: "She shows the product", symbol: "✦" }}
              />
            ) : (
              <p className="text-sm text-neutral-400">
                You have no characters yet. <a href="/reference-sheet" className="font-semibold text-brand-400 hover:text-brand-300">Create a model</a> first.
              </p>
            )}
            {notReady && <p className="text-sm text-amber-300">{character!.name} has no reference images yet. Add a sheet on her page first.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-neutral-200">How many photos</span>
            <div className={segTrack} role="group" aria-label="How many photos">
              {Array.from({ length: MAX_UGC_SHOTS }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" aria-pressed={count === n} className={segItem(count === n)} onClick={() => setCount(n)}>
                  {n}
                </button>
              ))}
            </div>
            {count > 1 && <p className="text-xs text-neutral-500">Each photo gets its own place and framing, all fitting the product.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ugc-note" className="text-sm text-neutral-200">
              Anything specific? <span className="text-neutral-500">(optional)</span>
            </Label>
            <Textarea id="ugc-note" rows={2} maxLength={MAX_UGC_NOTE} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave empty and the scene is chosen from the product. Or: at a pool party, a mirror selfie, golden hour" />
          </div>
        </section>
      </div>

      <div className="panel flex flex-col gap-3 p-5 max-sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="max-sm:h-11 max-sm:w-full max-sm:text-[15px]" disabled={!canRun} onClick={() => void run(!!plan && !stale)}>
            {planning ? "Reading the product..." : plan && !stale ? "New ideas" : `${verb}${generation && count > 1 ? ` (${count})` : ""}`}
          </Button>
          <p className="text-xs text-neutral-500">
            {!uploaded.length
              ? "Add a product photo to start."
              : !character
                ? "Pick a character to start."
                : plan && !stale
                  ? "Plans different scenes for the same product and starts them."
                  : generation
                    ? `Reads the product, picks a scene that fits it and starts ${count > 1 ? `${count} photos, one every 5 seconds` : "the photo"}. Each photo is charged at the size shown on its button.`
                    : "Reads the product and writes a prompt for a scene that fits it."}
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        {plan && (
          <div className="flex flex-col gap-4 border-t border-neutral-800 pt-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">What was read from the product</p>
              <p className="text-sm text-neutral-300">
                {plan.product.product}
                {plan.product.label ? ` · “${plan.product.label}”` : ""}
              </p>
              {plan.product.aesthetic && <p className="text-sm text-neutral-400">Look: {plan.product.aesthetic}</p>}
              {stale && <p className="text-sm text-amber-300">These were planned for different photos or another character. Press the button above to plan again.</p>}
            </div>
            {!generation && (
              <div className="flex flex-col gap-1 text-xs text-neutral-400">
                <p className="font-semibold uppercase tracking-wide text-neutral-300">Attach these in your generator, in this order</p>
                <ol className="flex flex-col gap-0.5">
                  {plan.attach.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </div>
            )}
            {plan.shots.map((s, i) => (
              <div key={`${plan.id}-${i}`} className="flex flex-col gap-2 border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0">
                <p className="font-display text-sm font-bold text-neutral-50">
                  {plan.shots.length > 1 ? `${i + 1}. ` : ""}
                  {s.title}
                </p>
                <p className="text-sm leading-relaxed text-neutral-400">{s.scene}</p>
                <details className="group/prompt text-sm">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-200">
                    {generation ? "See the prompt" : "Prompt"} <span className="font-normal text-neutral-600">({s.prompt.length.toLocaleString("en-US")} characters)</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-sans text-sm text-neutral-300">{s.prompt}</pre>
                </details>
                {generation ? (
                  !stale && (
                    <GenerateImage
                      kind="ugc"
                      prompt={`UGC: ${s.title}`}
                      characterId={plan.characterId}
                      extraPaths={plan.paths}
                      meta={{ ugc: { product: plan.product.product, label: plan.product.label, worn: plan.product.worn, action: s.action, scene: s.scene, outfit: s.outfit } }}
                      actionLabel="Generate UGC"
                      defaultResolution="1.5k"
                      autoAspectRatio="3:4"
                      runSignal={runAll}
                      runDelayMs={staggerDelay(i)}
                    />
                  )
                ) : (
                  <CopyOpen text={s.prompt} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
