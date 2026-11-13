"use client";

import { SEND_TO_VARIANTS_EVENT, SEND_TO_VARIANTS_KEY, usageChanged } from "@/lib/panel-events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Step } from "@/components/ui/step";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { CopyOpen } from "@/components/copy-open";
import { MobileSheet } from "@/components/mobile-sheet";
import { SlidersIcon } from "@/components/icons";
import { AttachStrip, TaggedPrompt, type AttachTile } from "@/components/attach-strip";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { importGeneratedImage, planCarousel, writeVariantEdits } from "@/app/(app)/variants/actions";
import {
  CAROUSEL_TYPES,
  carouselTypeLabel,
  DEFAULT_NEW_SLIDES,
  DEFAULT_VARIANT_COUNT,
  MAX_EXTRA_IMAGES,
  MAX_NEW_SLIDES,
  MAX_VARIANT_COUNT,
  MAX_WRITE_ONLY,
  PLATFORM_OTHER_MAX,
  PLATFORMS,
  VARIANT_DIMS,
  type CarouselTypeId,
  type PlatformId,
  type SlidePerson,
  type VariantDimId,
} from "@/lib/variants-meta";
import { chipItem, segItem, segTrack } from "@/components/ui/segmented";
import { CharacterPicker } from "@/components/character-picker";

/**
 * The two tabs: Photoshoot ("edits": this same scene and setting, new takes) and Moments ("carousel": shots from
 * throughout her day). "write" is Moments made elsewhere: finished prompts for another generator, with what to attach.
 */
type Mode = "edits" | "carousel" | "write";
type Tab = "edits" | "carousel";
const TABS: { id: Tab; label: string; about: string }[] = [
  { id: "edits", label: "Photoshoot", about: "The same scene and setting, new takes: change the pose, camera angle, expression, hair, outfit or light of this shot." },
  { id: "carousel", label: "Moments", about: "Shots from throughout her day, built from this one: new spots, outfit close-ups, the place, food and drink. For a carousel or a photo dump." },
];
/** Here or elsewhere, remembered in this browser. */
const ELSEWHERE_KEY = "ms.variantsElsewhere";
/** A picked image: a file to upload, or (from the viewer's Variants button) one already copied to `path`. */
type Picked = { file?: File; preview: string; path?: string };
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
  /** Write only: the images to attach in the other generator, in @image order. */
  attach?: string[];
  attachItems?: AttachTile[];
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
  extraPreviews: string[];
  characterId: string | null;
  mode: Mode;
  /** One per press of Write prompts: new cards start empty, and the images already made stay in the tray. */
  runId: string;
  /** Made elsewhere: copy-and-paste prompts with no Generate buttons. */
  elsewhere: boolean;
}

const chip = chipItem;

export function VariantsTool({ characters }: { characters: { id: string; name: string; ready: boolean; hasSheet?: boolean; photo?: string | null }[] }) {
  const router = useRouter();
  const generation = useGeneration();
  const [tab, setTab] = useState<Tab>("edits");
  // Here (Generate buttons) or elsewhere (finished prompts to paste). Without image generation, always elsewhere.
  const [elsewhereChoice, setElsewhere] = useState(false);
  const elsewhere = !generation || elsewhereChoice;
  useEffect(() => {
    try {
      setElsewhere(localStorage.getItem(ELSEWHERE_KEY) === "1");
    } catch {
      // Starts on Here in a private window.
    }
  }, []);
  // What a run makes: Moments made elsewhere are the finished-prompt kind.
  const mode: Mode = tab === "carousel" && elsewhere ? "write" : tab;
  const [characterId, setCharacterId] = useState("");
  // Phones: the choices live in a bottom sheet, so the image, her face and the button fit on one screen.
  const [sheet, setSheet] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [image, setImage] = useState<Picked | null>(null);
  // Up to MAX_EXTRA_IMAGES more images for the vibe or outfit; a slot is null until something is added.
  const [extras, setExtras] = useState<(Picked | null)[]>(Array(MAX_EXTRA_IMAGES).fill(null));
  const [dims, setDims] = useState<Set<VariantDimId>>(new Set(["pose", "angle"]));
  const [types, setTypes] = useState<Set<CarouselTypeId>>(new Set(CAROUSEL_TYPES.map((t) => t.id)));
  const [slides, setSlides] = useState(DEFAULT_NEW_SLIDES);
  // Where the set is going (Carousel and Write only): sets the tone and how spicy it is. None picked means no steer.
  const [platform, setPlatform] = useState<PlatformId | null>(null);
  const [platformOther, setPlatformOther] = useState("");
  const [count, setCount] = useState<number>(DEFAULT_VARIANT_COUNT);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; good: boolean }>();
  const [result, setResult] = useState<Result | null>(null);
  // Goes up by one each time "Generate all" is pressed; every slide or variant that hasn't run yet starts.
  const [runAll, setRunAll] = useState(0);
  const { toast, show } = useToast(2000);

  // The viewer's Variants button: its image lands in the "Generated image" slot, on Edits.
  useEffect(() => {
    const take = async () => {
      let sent: { generationId?: string | null; url?: string } | null = null;
      try {
        const raw = sessionStorage.getItem(SEND_TO_VARIANTS_KEY);
        sessionStorage.removeItem(SEND_TO_VARIANTS_KEY);
        sent = raw ? (raw.startsWith("{") ? JSON.parse(raw) : { url: raw }) : null;
      } catch {
        return;
      }
      if (!sent?.generationId && !sent?.url) return;
      setStatus({ text: "Adding the image…", good: true });
      try {
        // A site image is copied on the server by its id (its link can be the provider's, which the browser can't read).
        let picked: Picked;
        if (sent.generationId) {
          const r = await importGeneratedImage(sent.generationId);
          if (!r.ok) throw new Error(r.error);
          picked = { path: r.path, preview: r.preview };
        } else {
          const res = await fetch(sent.url as string);
          if (!res.ok) throw new Error();
          const blob = await res.blob();
          const file = new File([blob], `generated.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type || "image/jpeg" });
          picked = { file, preview: URL.createObjectURL(file) };
        }
        setImage(picked);
        setResult(null);
        setStatus(undefined);
        setTab("edits");
        show("Image added. Pick what to change, then press Write prompts.");
      } catch (e) {
        setStatus({ text: (e instanceof Error && e.message) || "Couldn't load that image. Download it and add it here instead.", good: false });
      }
    };
    void take();
    window.addEventListener(SEND_TO_VARIANTS_EVENT, take);
    return () => window.removeEventListener(SEND_TO_VARIANTS_EVENT, take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // The old cards go; the images made from them stay in the tray at the bottom of the page.
    setResult(null);
    setStatus({ text: mode === "edits" ? "Reading the image and planning the shoot…" : "Reading the image and planning her day…", good: true });
    try {
      const path = image.path ?? (await uploadImage(image.file as File, "target"));
      setImage({ ...image, path });
      // Extra images are uploaded once and reused on the next run.
      const uploaded = await Promise.all(extras.map(async (x) => (x ? { ...x, path: x.path ?? (await uploadImage(x.file as File, "target")) } : null)));
      setExtras(uploaded);
      const extraPaths = uploaded.filter((x): x is Picked & { path: string } => !!x?.path).map((x) => x.path);
      const common = { characterId: characterId || null, note, extraPaths };
      const where = { platform, platformOther: platform === "other" ? platformOther.trim() : "" };
      const extraPreviews = uploaded.filter((x): x is Picked & { path: string } => !!x?.path).map((x) => x.preview);
      const base = { path, preview: image.preview, extraPaths, extraPreviews, characterId: characterId || null, mode, runId: crypto.randomUUID(), elsewhere };
      const who = (p: SlidePerson, type: string) => (p === "none" ? " · no person" : p === "partial" ? " · partly her" : type === "pose" ? "" : " · with her");
      if (mode === "edits") {
        const res = await writeVariantEdits({ imagePath: path, dims: [...dims], count, ...common });
        usageChanged();
        if (!res.ok) {
          if (res.redirectTo) return router.push(res.redirectTo);
          return setStatus({ text: res.error, good: false });
        }
        setResult({ ...base, theme: "", attach: res.attach, items: res.variants.map((v) => ({ title: v.label, hint: v.changes, copy: v.prompt, historyId: v.historyId })) });
        setStatus({ text: elsewhere ? `${res.variants.length} prompts ready. Paste one into your generator's edit mode with the images listed, in that order.` : `${res.variants.length} takes ready. Generate them one by one or press Generate all.`, good: true });
      } else if (mode === "write") {
        const res = await planCarousel({ coverPath: path, types: [...types], count: Math.min(slides, MAX_WRITE_ONLY), writeOnly: true, ...where, ...common });
        usageChanged();
        if (!res.ok) {
          if (res.redirectTo) return router.push(res.redirectTo);
          return setStatus({ text: res.error, good: false });
        }
        setResult({
          ...base,
          theme: res.theme,
          attach: [],
          items: res.slides.map((s) => ({ title: s.label, hint: carouselTypeLabel(s.type) + who(s.person, s.type), copy: s.copy, attach: s.attach, attachItems: s.attachItems, historyId: s.historyId })),
        });
        setStatus({ text: `${res.slides.length} prompt${res.slides.length > 1 ? "s" : ""} ready to paste into another generator. Attach the images listed on each one, in that order.`, good: true });
      } else {
        const res = await planCarousel({ coverPath: path, types: [...types], count: Math.min(slides, MAX_NEW_SLIDES), ...where, ...common });
        usageChanged();
        if (!res.ok) {
          if (res.redirectTo) return router.push(res.redirectTo);
          return setStatus({ text: res.error, good: false });
        }
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
    : mode === "write" || (mode === "edits" && elsewhere)
      ? `Prompts with her name ${character.name}'s ${character.hasSheet ? "reference sheets" : "first reference photo"} as the first images to attach, and spell out her look, so another generator keeps her face and body.`
      : mode === "edits"
      ? `Generate sends ${character.name}'s ${character.hasSheet ? "reference sheets" : "first reference photo"} first and your image after them, so the face stays locked to the ${character.hasSheet ? "sheet" : "reference"}.`
      : `Slides with her get ${character.name}'s face and body references; slides without her use only your cover.`;

  const countField = (
          <div className="flex flex-col gap-1.5">
            {mode === "edits" ? (
              <>
                <Label htmlFor="variant-count">How many takes</Label>
                <select id="variant-count" value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-10 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm">
                  {Array.from({ length: MAX_VARIANT_COUNT }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </>
            ) : (
              <>
                <Label htmlFor="slides">{elsewhere ? "How many moments" : "New moments after yours"}</Label>
                <select id="slides" value={Math.min(slides, elsewhere ? MAX_WRITE_ONLY : MAX_NEW_SLIDES)} onChange={(e) => setSlides(Number(e.target.value))} className="h-10 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm">
                  {Array.from({ length: elsewhere ? MAX_WRITE_ONLY : MAX_NEW_SLIDES }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </>
            )}
          </div>
  );

  return (
    <div className="mt-6 flex flex-col gap-6 max-sm:mt-4 max-sm:gap-4">
      {toast}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className={segTrack} role="tablist" aria-label="What to make">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setResult(null);
                  setStatus(undefined);
                }}
                className={segItem(tab === t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {generation && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-400">Make the images</span>
              <div role="radiogroup" aria-label="Make the images" className={segTrack}>
                {([false, true] as const).map((w) => (
                  <button
                    key={String(w)}
                    type="button"
                    role="radio"
                    aria-checked={elsewhere === w}
                    onClick={() => {
                      setElsewhere(w);
                      setResult(null);
                      setStatus(undefined);
                      try {
                        localStorage.setItem(ELSEWHERE_KEY, w ? "1" : "0");
                      } catch {
                        // Not remembered in a private window.
                      }
                    }}
                    className={segItem(elsewhere === w)}
                  >
                    {w ? "Elsewhere (copy prompts)" : "Here"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-400">{TABS.find((t) => t.id === tab)!.about}</p>
      </div>

      <section className="panel flex flex-col gap-3 p-4">
        <Step n={1} title="Add your images" hint="Your main image, plus up to 2 extras for the vibe or an outfit." />
        <div className="grid grid-cols-3 gap-2 sm:gap-3 [&>*]:min-w-0">
          <ImageDrop
            layout="tile"
            title="Your image"
            hint="Required. Click, drop or paste."
            preview={image?.preview}
            disabled={busy}
            onPick={(file) => {
              setImage({ file, preview: URL.createObjectURL(file) });
              setResult(null);
            }}
          />
          {extras.map((x, i) => (
            <div key={i} className="flex flex-col gap-1">
              <ImageDrop
                layout="tile"
                title={`Extra image ${i + 1}`}
                hint="Optional."
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
        <p id="extras-title" className="text-xs text-neutral-500 max-sm:hidden">
          <span className="font-medium text-neutral-400">More images</span> are optional, up to {MAX_EXTRA_IMAGES}: show the AI the vibe, an outfit or anything else you want carried into the {tab === "carousel" ? "moments" : "takes"}, and say how to use them in the creative direction.
        </p>
      </section>

      <section className="panel flex flex-col gap-4 p-4">
        <Step n={2} title={tab === "carousel" ? "Plan her day" : "Choose what changes"} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="character">Character <span className="text-xs font-normal text-neutral-500">optional</span></Label>
            <CharacterPicker
              id="character"
              value={characterId}
              onChange={setCharacterId}
              none={{ label: "No character", note: "Use the image only" }}
              characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "No images yet" }))}
            />
          </div>
          {!phone && countField}
          {noRefs ? (
            <p className="text-sm text-amber-400 sm:col-span-3">
              Add reference images on <Link href={`/characters/${character!.id}`} className="underline">the character page</Link> first, or pick no character.
            </p>
          ) : (
            <p className="-mt-1 text-xs text-neutral-500 sm:col-span-3 max-sm:line-clamp-2">{hint}</p>
          )}
        </div>

        <MobileSheet open={sheet} onClose={() => setSheet(false)} title="Options" className="flex flex-col gap-4 max-sm:p-4">
          {phone && countField}
        {mode === "edits" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">What may change</legend>
            <div className="flex flex-wrap gap-2">
              {VARIANT_DIMS.map((d) => (
                <label key={d.id} className={chip(dims.has(d.id))}>
                  <input type="checkbox" className="sr-only" checked={dims.has(d.id)} onChange={() => toggle(setDims, d.id)} />
                  {d.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-neutral-500">Each take changes one or two of these, and together the takes cover them. Everything else stays the same.</p>
          </fieldset>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Kinds of moment</legend>
            <div className="flex flex-wrap gap-2">
              {CAROUSEL_TYPES.map((t) => (
                <label key={t.id} className={chip(types.has(t.id))}>
                  <input type="checkbox" className="sr-only" checked={types.has(t.id)} onChange={() => toggle(setTypes, t.id)} />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {mode !== "edits" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Posting to <span className="text-xs font-normal text-neutral-500">optional</span></legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((x) => (
                <label key={x.id} className={chip(platform === x.id)}>
                  <input
                    type="radio"
                    name="platform"
                    className="sr-only"
                    checked={platform === x.id}
                    onChange={() => setPlatform(x.id)}
                    onClick={() => platform === x.id && setPlatform(null)}
                  />
                  {x.label}
                </label>
              ))}
            </div>
            {platform === "other" && (
              <Input
                value={platformOther}
                onChange={(e) => setPlatformOther(e.target.value)}
                maxLength={PLATFORM_OTHER_MAX}
                placeholder="Where is it going? e.g. Threads, a Telegram channel, Patreon"
                aria-label="Where it will be posted"
              />
            )}
            <p className="text-xs text-neutral-500">
              Sets the tone and how spicy the shots are: social-safe for Instagram and TikTok, bolder for X and Reddit, teasing subscriber shots for Fanvue and OnlyFans. Click a platform again to clear it.
            </p>
          </fieldset>
        )}

        <section className="flex flex-col gap-2">
          <Label htmlFor="note">Creative direction <span className="text-xs font-normal text-neutral-500">optional</span></Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder={tab === "carousel" ? "e.g. same outfit, but now she's getting ready at a hotel vanity at night, flash photos, playful and moody" : undefined}
            aria-describedby={tab === "carousel" ? "note-hint" : undefined}
            rows={2}
          />
          {tab === "carousel" && (
            <p id="note-hint" className="text-xs text-neutral-500">
              The creative director builds every prompt around this: the place, poses, outfit, mood and story you describe win over its own ideas. Her face and body always stay hers.
            </p>
          )}
        </section>
        </MobileSheet>
      </section>

      <div className="flex flex-wrap items-center gap-3 max-sm:flex-nowrap max-sm:gap-2">
        <button type="button" onClick={() => setSheet(true)} className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-800/60 px-4 text-sm font-semibold text-neutral-100 transition-transform active:scale-95 sm:hidden">
          <SlidersIcon className="h-[18px] w-[18px]" /> Options
        </button>
        <Button type="button" onClick={run} className="max-sm:h-12 max-sm:flex-1 max-sm:rounded-2xl" disabled={busy || !image || noRefs || (mode === "edits" ? dims.size === 0 : types.size === 0)}>
          {busy ? "Writing..." : "Write prompts"}
        </Button>
        {status && !phone && <p role="status" className={`text-sm ${status.good ? "text-neutral-300" : "text-red-400"}`}>{status.text}</p>}
      </div>
      {status && phone && <p role="status" className={`-mt-2 px-1 text-sm ${status.good ? "text-neutral-300" : "text-red-400"}`}>{status.text}</p>}

      {result && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">{result.mode === "edits" ? "Photoshoot" : "Moments"}</h2>
            <div className="flex gap-2">
              {!result.elsewhere && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const n = result.items.length;
                    if (window.confirm(`Generate all ${n} ${result.mode === "edits" ? "takes" : "moments"}? This starts ${n} images on your Image key; each one's price is shown on its own button.`)) setRunAll((v) => v + 1);
                  }}
                >
                  Generate all
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => copy(result.items.map((it, i) => `${result.mode === "carousel" ? i + 2 : i + 1}. ${it.title}\n${it.attach?.length ? `Attach: ${it.attach.join(", ")}\n` : ""}${it.copy}`).join("\n\n"))}
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
                  <span className="font-medium">1 · Your image</span>
                  <p className="text-xs text-neutral-500">The first moment, posted as is</p>
                </div>
              </CardContent>
            </Card>
          )}
          {result.items.map((item, i) => (
            <Card key={`${result.runId}-${i}`}>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{result.mode === "carousel" ? `${i + 2} · ` : result.mode === "write" ? `${i + 1} · ` : ""}{item.title}</span>
                    {item.hint && <p className="text-xs text-neutral-500">{item.hint}</p>}
                  </div>
                  {!result.elsewhere && <Button type="button" size="sm" variant="ghost" onClick={() => copy(item.copy)}>Copy</Button>}
                </div>
                {result.elsewhere && <CopyOpen text={item.copy} />}
                {result.mode === "write" && item.attachItems?.length ? (
                  <>
                    <AttachStrip items={item.attachItems} photo={result.preview} extras={result.extraPreviews} />
                    <TaggedPrompt text={item.copy} />
                  </>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{item.copy}</p>
                )}
                {result.elsewhere ? null : result.mode === "edits" ? (
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
