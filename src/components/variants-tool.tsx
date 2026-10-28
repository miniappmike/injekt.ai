"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { planCarousel, writeVariantEdits } from "@/app/(app)/variants/actions";
import {
  CAROUSEL_TYPES,
  carouselTypeLabel,
  DEFAULT_NEW_SLIDES,
  DEFAULT_VARIANT_COUNT,
  MAX_EXTRA_IMAGES,
  MAX_NEW_SLIDES,
  MAX_VARIANT_COUNT,
  VARIANT_DIMS,
  type CarouselTypeId,
  type SlidePerson,
  type VariantDimId,
} from "@/lib/variants-meta";

type Mode = "edits" | "carousel";
type Picked = { file: File; preview: string; path?: string };
interface Item {
  title: string;
  /** Under the title: what the edit changes, or the slide's type and who is in it. */
  hint: string;
  /** What the person copies. */
  copy: string;
  /** Carousel: the slide with placeholders, framed by the server when generating. */
  slidePrompt?: string;
  person?: SlidePerson;
  /** Its History entry, so History can open the image made from it. */
  historyId?: string | null;
}
interface Result {
  items: Item[];
  attach: string[];
  theme: string;
  /** The uploaded image the prompts refer to, and the character they were written for. */
  path: string;
  preview: string;
  /** Extra images (vibe, outfit) the prompts refer to after the main image. */
  extraPaths: string[];
  characterId: string | null;
  mode: Mode;
}

const chip = (on: boolean) => `cursor-pointer rounded-md border px-3 py-1.5 text-sm ${on ? "border-neutral-300 bg-neutral-800" : "border-neutral-700 text-neutral-400"}`;

export function VariantsTool({ characters }: { characters: { id: string; name: string; ready: boolean; hasSheet?: boolean }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("edits");
  const [characterId, setCharacterId] = useState("");
  const [image, setImage] = useState<Picked | null>(null);
  // Up to MAX_EXTRA_IMAGES more images for the vibe or outfit; a slot is null until something is added.
  const [extras, setExtras] = useState<(Picked | null)[]>(Array(MAX_EXTRA_IMAGES).fill(null));
  const [dims, setDims] = useState<Set<VariantDimId>>(new Set(["pose", "angle"]));
  const [types, setTypes] = useState<Set<CarouselTypeId>>(new Set(CAROUSEL_TYPES.map((t) => t.id)));
  const [slides, setSlides] = useState(DEFAULT_NEW_SLIDES);
  const [count, setCount] = useState<number>(DEFAULT_VARIANT_COUNT);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; good: boolean }>();
  const [result, setResult] = useState<Result | null>(null);
  // Goes up by one each time "Generate all" is pressed; every slide or variant that hasn't run yet starts.
  const [runAll, setRunAll] = useState(0);
  const { toast, show } = useToast(2000);

  const character = characters.find((c) => c.id === characterId);
  const noRefs = !!character && !character.ready;

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, id: T) =>
    set((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    show("Copied");
  };

  async function run() {
    if (!image) return;
    setBusy(true);
    setStatus({ text: mode === "edits" ? "Reading the image and planning variants…" : "Reading the image and planning the carousel…", good: true });
    try {
      const path = image.path ?? (await uploadImage(image.file, "target"));
      setImage({ ...image, path });
      // Extra images are uploaded once and reused on the next run.
      const uploaded = await Promise.all(extras.map(async (x) => (x ? { ...x, path: x.path ?? (await uploadImage(x.file, "target")) } : null)));
      setExtras(uploaded);
      const extraPaths = uploaded.filter((x): x is Picked & { path: string } => !!x?.path).map((x) => x.path);
      const common = { characterId: characterId || null, note, extraPaths };
      const base = { path, preview: image.preview, extraPaths, characterId: characterId || null, mode };
      if (mode === "edits") {
        const res = await writeVariantEdits({ imagePath: path, dims: [...dims], count, ...common });
        if (!res.ok) {
          if (res.redirectTo) return router.push(res.redirectTo);
          return setStatus({ text: res.error, good: false });
        }
        setResult({ ...base, theme: "", attach: res.attach, items: res.variants.map((v) => ({ title: v.label, hint: v.changes, copy: v.prompt, historyId: v.historyId })) });
        setStatus({ text: `${res.variants.length} edit prompts ready. Copy one and paste it into your generator's edit mode, or generate it here.`, good: true });
      } else {
        const res = await planCarousel({ coverPath: path, types: [...types], count: slides, ...common });
        if (!res.ok) {
          if (res.redirectTo) return router.push(res.redirectTo);
          return setStatus({ text: res.error, good: false });
        }
        const who = (p: SlidePerson, type: string) => (p === "none" ? " · no person" : p === "partial" ? " · partly her" : type === "pose" ? "" : " · with her");
        setResult({
          ...base,
          theme: res.theme,
          attach: [],
          items: res.slides.map((s) => ({ title: s.label, hint: carouselTypeLabel(s.type) + who(s.person, s.type), copy: s.copy, slidePrompt: s.prompt, person: s.person, historyId: s.historyId })),
        });
        setStatus({ text: `Cover + ${res.slides.length} new slide${res.slides.length > 1 ? "s" : ""} planned. Generate them one by one or press Generate all.`, good: true });
      }
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "Something went wrong", good: false });
    } finally {
      setBusy(false);
    }
  }

  const hint = !character
    ? "Picking one restates the character's key traits in every edit, so the face doesn't drift."
    : mode === "edits"
      ? `Generate sends ${character.name}'s ${character.hasSheet ? "reference sheets" : "first reference photo"} first and your image after them, so the face stays locked to the ${character.hasSheet ? "sheet" : "reference"}.`
      : `Slides with her get ${character.name}'s face and body references; slides without her use only your cover.`;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {toast}
      <div className="flex gap-1" role="tablist">
        {(["edits", "carousel"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setResult(null);
              setStatus(undefined);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-100"}`}
          >
            {m === "edits" ? "Edits" : "Carousel"}
          </button>
        ))}
      </div>

      <ImageDrop
        title={mode === "edits" ? "Generated image" : "Cover image"}
        preview={image?.preview}
        disabled={busy}
        onPick={(file) => {
          setImage({ file, preview: URL.createObjectURL(file) });
          setResult(null);
        }}
      />

      <section className="flex flex-col gap-2" aria-labelledby="extras-title">
        <div>
          <h2 id="extras-title" className="text-sm font-medium">More images <span className="text-xs font-normal text-neutral-500">optional, up to {MAX_EXTRA_IMAGES}</span></h2>
          <p className="text-xs text-neutral-500">
            Show the AI the vibe, an outfit or anything else you want carried into the {mode === "edits" ? "variants" : "slides"}. Say how to use them in the {mode === "edits" ? "creative direction" : "theme"}.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {extras.map((x, i) => (
            <div key={i} className="flex flex-col gap-1">
              <ImageDrop
                title={`Extra image ${i + 1}`}
                hint="Click, drop, or paste with Ctrl+V."
                preview={x?.preview}
                disabled={busy}
                onPick={(file) => {
                  setExtras((list) => list.map((old, j) => (j === i ? { file, preview: URL.createObjectURL(file) } : old)));
                  setResult(null);
                }}
              />
              {x && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  disabled={busy}
                  onClick={() => {
                    setExtras((list) => list.map((old, j) => (j === i ? null : old)));
                    setResult(null);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <select id="character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
          <option value="">No character, use the image only</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : " (no images yet)"}</option>
          ))}
        </select>
        {noRefs ? (
          <p className="text-sm text-amber-400">
            Add reference images on <Link href={`/characters/${character!.id}`} className="underline">the character page</Link> first, or pick no character.
          </p>
        ) : (
          <p className="text-xs text-neutral-500">{hint}</p>
        )}
      </section>

      {mode === "edits" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">What may change</legend>
          <div className="flex flex-wrap gap-2">
            {VARIANT_DIMS.map((d) => (
              <label key={d.id} className={chip(dims.has(d.id))}>
                <input type="checkbox" className="sr-only" checked={dims.has(d.id)} onChange={() => toggle(setDims, d.id)} />
                {d.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-neutral-500">Each edit changes one or two of these, and together the edits cover them. Everything else stays the same.</p>
          <Label htmlFor="variant-count" className="mt-2">How many edits</Label>
          <select id="variant-count" value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
            {Array.from({ length: MAX_VARIANT_COUNT }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Slide types</legend>
          <div className="flex flex-wrap gap-2">
            {CAROUSEL_TYPES.map((t) => (
              <label key={t.id} className={chip(types.has(t.id))}>
                <input type="checkbox" className="sr-only" checked={types.has(t.id)} onChange={() => toggle(setTypes, t.id)} />
                {t.label}
              </label>
            ))}
          </div>
          <Label htmlFor="slides" className="mt-2">New slides after the cover</Label>
          <select id="slides" value={slides} onChange={(e) => setSlides(Number(e.target.value))} className="h-9 w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
            {Array.from({ length: MAX_NEW_SLIDES }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </fieldset>
      )}

      <section className="flex flex-col gap-2">
        <Label htmlFor="note">{mode === "edits" ? "Creative direction" : "Theme"} <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={run} disabled={busy || !image || noRefs || (mode === "edits" ? dims.size === 0 : types.size === 0)}>
          {busy ? "Writing..." : mode === "edits" ? "Write variant edits" : "Plan carousel"}
        </Button>
        {status && <p role="status" className={`text-sm ${status.good ? "text-neutral-300" : "text-red-400"}`}>{status.text}</p>}
      </div>

      {result && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">{result.mode === "edits" ? "Variant edits" : "Carousel plan"}</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const n = result.items.length;
                  if (window.confirm(`Generate all ${n} ${result.mode === "edits" ? "variants" : "slides"}? This starts ${n} images on your Image key; each one's price is shown on its own button.`)) setRunAll((v) => v + 1);
                }}
              >
                Generate all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => copy(result.items.map((it, i) => `${result.mode === "edits" ? i + 1 : i + 2}. ${it.title}\n${it.copy}`).join("\n\n"))}
              >
                Copy all
              </Button>
            </div>
          </div>
          {result.theme && <p className="text-sm text-neutral-400">Theme: {result.theme}</p>}
          {result.attach.length > 0 && <p className="text-xs text-neutral-500">Attach the images in this order: {result.attach.join(", ")}.</p>}
          {result.mode === "carousel" && (
            <Card>
              <CardContent className="flex items-center gap-3 pt-5 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.preview} alt="Cover" className="h-14 w-14 rounded object-cover" />
                <div>
                  <span className="font-medium">1 · Cover</span>
                  <p className="text-xs text-neutral-500">Your image, posted as is</p>
                </div>
              </CardContent>
            </Card>
          )}
          {result.items.map((item, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{result.mode === "carousel" ? `${i + 2} · ` : ""}{item.title}</span>
                    {item.hint && <p className="text-xs text-neutral-500">{item.hint}</p>}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => copy(item.copy)}>Copy</Button>
                </div>
                <p className="whitespace-pre-wrap break-words">{item.copy}</p>
                {result.mode === "edits" ? (
                  <GenerateImage prompt={item.copy} characterId={result.characterId} extraPaths={[result.path, ...result.extraPaths]} kind="variant" runSignal={runAll} historyId={item.historyId} />
                ) : (
                  <GenerateImage
                    prompt={item.slidePrompt as string}
                    characterId={result.characterId}
                    extraPaths={[result.path, ...result.extraPaths]}
                    kind="carousel"
                    meta={{ person: item.person }}
                    runSignal={runAll}
                    checkLikeness={item.person === "full"}
                    historyId={item.historyId}
                  />
                )}
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-neutral-500">Saved in History.</p>
        </section>
      )}
    </div>
  );
}
