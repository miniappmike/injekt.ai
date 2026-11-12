"use client";

import { usageChanged } from "@/lib/panel-events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerateImage } from "@/components/generate-image";
import { AttachStrip, TaggedPrompt } from "@/components/attach-strip";
import { CopyOpen } from "@/components/copy-open";
import { useGeneration } from "@/components/app-context";
import { InfoTip } from "@/components/info-tip";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { clipboardImages, usePasteTarget } from "@/components/paste-router";
import { cleanOverlays, deleteOutfit, extractOutfit, recoverInjectPrompts, saveOutfit, warmSheetPack, writeInjectStandalone } from "@/app/(app)/inject/actions";
import { awaitOrRecover } from "@/lib/recoverable";
import { liveText, streamInjectPrompts } from "@/lib/inject-stream";
import type { AiFailure } from "@/lib/ai/failure";
import type { StandalonePrompt } from "@/lib/inject-standalone";
import type { SavedOutfit } from "@/lib/outfits";
import { INJECT_DEFAULTS, MAX_VERSIONS, metaForRun, readEditTarget, writeEditTarget, type InjectMeta, type InjectOptionsInput } from "@/lib/inject-meta";
import { closestAspectRatio } from "@/lib/aspect";
import { SEND_TO_LIKENESS_KEY } from "@/lib/likeness-link";
import type { ImageAspectRatio } from "@/lib/ai/providers/types";
import { segItem, segTrack } from "@/components/ui/segmented";
import { CharacterPicker } from "@/components/character-picker";
import { MobileSheet } from "@/components/mobile-sheet";
import { PasteIcon, SlidersIcon, UploadIcon } from "@/components/icons";
import { readClipboardImages } from "@/lib/clipboard";

const MAX_TARGETS = 10;
const OPTIONS_KEY = "ms.injectOptions";
/** Write only: prompts to paste into another generator instead of Generate buttons. Remembered per browser. */
const WRITE_ONLY_KEY = "ms.injectWriteOnly";
const select = "h-10 w-full rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm";

export interface InjectCharacter {
  id: string;
  name: string;
  ready: boolean;
  /** A saved profile; without one the prompts can only describe her from the sheet's words. */
  hasProfile: boolean;
  /** Her picture in the character picker. */
  photo?: string | null;
}

interface Version {
  text: string;
  fixed: string[];
  tags: string[];
  meta: InjectMeta;
  /** Its History entry, so History can open the image made from it. */
  historyId?: string | null;
}

interface Target {
  id: string;
  file: File;
  preview: string;
  path?: string;
  /** The model ratio closest to this photo, for "match the photo" when it isn't the first image sent. */
  ratio?: ImageAspectRatio;
  status?: string;
  state?: "queued" | "busy" | "done" | "error";
  /** The character the versions were written for, so Generate uses the same one if the picker changes. */
  characterId?: string;
  /** A copy cleaned of overlays (kept, so turning the option off goes back to the original). */
  clean?: { path: string; removed: string[] };
  /** The photo the versions were written for (the cleaned copy when cleaning was on). */
  writtenPath?: string;
  versions?: (Version | null)[];
  /** The prompt so far, while the model is writing it. */
  live?: string;
}

type Options = Required<Omit<InjectOptionsInput, "count">> & { count: number };

function loadOptions(): Options {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}");
    return { ...INJECT_DEFAULTS, ...saved, who: "", extra: saved.extra ?? "" };
  } catch {
    return { ...INJECT_DEFAULTS };
  }
}

export function InjectWriter({ characters, outfits: initialOutfits = [], initialCharacterId }: { characters: InjectCharacter[]; outfits?: SavedOutfit[]; initialCharacterId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { toast, show } = useToast();
  const [characterId, setCharacterId] = useState(initialCharacterId ?? characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [targets, setTargets] = useState<Target[]>([]);
  const [o, setO] = useState<Options>({ ...INJECT_DEFAULTS });
  const [editTarget, setEditTarget] = useState(false);
  const generation = useGeneration();
  const [writeOnlyChoice, setWriteOnly] = useState(false);
  // Without image generation turned on, every prompt is written to paste into a generator.
  const writeOnly = !generation || writeOnlyChoice;
  // Write only: each target's finished prompts, for the versions and settings they were made from.
  const [standalone, setStandalone] = useState<Record<string, { key: string; prompts?: StandalonePrompt[]; error?: string }>>({});
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ text: string; good: boolean }>();
  const [extracting, setExtracting] = useState(false);
  const [outfits, setOutfits] = useState<SavedOutfit[]>(initialOutfits);
  const [outfitName, setOutfitName] = useState("");
  // Phones: the options live in a bottom sheet.
  const [sheet, setSheet] = useState(false);
  // Which layout is showing, so the prompt controls render once: in the sheet on a phone, beside the button otherwise.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [pasteError, setPasteError] = useState<string>();
  const stop = useRef(false);
  const rerunAfter = useRef(false);
  const lastRunFor = useRef<string | null>(null);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const character = characters.find((c) => c.id === characterId)!;

  // Saved choices come back on the next visit; "which person" is per photo, so it starts empty.
  useEffect(() => {
    setO(loadOptions());
    setEditTarget(readEditTarget());
    try {
      setWriteOnly(localStorage.getItem(WRITE_ONLY_KEY) === "1");
    } catch {
      // Starts on Generate here in a private window.
    }
  }, []);
  useEffect(() => {
    try {
      const { who: _w, ...keep } = o;
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(keep));
    } catch {
      // Not saved in a private window; the page still works.
    }
  }, [o]);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setO((x) => ({ ...x, [k]: v }));
  const update = (id: string, patch: Partial<Target>) => setTargets((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Her sheet is read once in the background when she is picked, so the first prompt doesn't wait for it.
  useEffect(() => {
    if (character.ready) void warmSheetPack(characterId);
  }, [characterId, character.ready]);

  function addFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const room = MAX_TARGETS - targets.length;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setTargets((t) => [...t, ...added]);
    for (const t of added) {
      const img = new Image();
      img.onload = () => update(t.id, { ratio: closestAspectRatio(img.naturalWidth, img.naturalHeight) });
      img.src = t.preview;
    }
  }

  async function pasteFromClipboard() {
    try {
      addFiles(await readClipboardImages());
      setPasteError(undefined);
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : "Couldn't paste.");
    }
  }

  // Ctrl+V anywhere on the page (not while typing) adds the copied photo as a target: the box is the page's paste target.
  const targetBox = useRef<HTMLElement>(null);
  usePasteTarget(targetBox, (f) => addFiles(f), running);

  async function ensureUploaded(t: Target): Promise<string | null> {
    if (t.path) return t.path;
    try {
      const path = await uploadImage(t.file, "target");
      update(t.id, { path });
      return path;
    } catch (e) {
      update(t.id, { state: "error", status: e instanceof Error ? e.message : "Upload failed" });
      return null;
    }
  }

  async function run() {
    if (running) return;
    const list = targetsRef.current;
    if (!list.length || !character.ready) return;
    setRunning(true);
    stop.current = false;
    rerunAfter.current = false;
    lastRunFor.current = characterId;
    setSummary(undefined);
    setTargets((t) => t.map((x) => ({ ...x, state: "queued", status: "Waiting…", versions: undefined })));
    const n = list.length;
    let done = 0;
    let stoppedBecause = "";
    for (const [i, t] of list.entries()) {
      if (stop.current) {
        update(t.id, { state: "error", status: "Skipped." });
        continue;
      }
      update(t.id, { state: "busy", status: o.count > 1 ? `Writing ${o.count} versions in one call…` : "Reading the target image…" });
      const uploaded = await ensureUploaded(t);
      if (!uploaded) continue;
      let path = uploaded;
      if (o.clean) {
        // Cleaned once and reused on later runs; if cleaning fails the original is used.
        let clean = t.clean;
        if (!clean) {
          update(t.id, { status: "Cleaning up overlays…" });
          const c = await cleanOverlays(uploaded);
          if (c.ok) {
            clean = { path: c.path, removed: c.removed };
            update(t.id, { clean });
          } else if (c.redirectTo) {
            setRunning(false);
            return router.push(c.redirectTo);
          }
        }
        if (clean) path = clean.path;
        update(t.id, { status: o.count > 1 ? `Writing ${o.count} versions in one call…` : "Reading the target image…" });
      }
      // On a phone the answer can be lost while Safari is in the background; the server still saves the prompts to
      // History, so they are picked up from there when the page comes back.
      const since = new Date().toISOString();
      // The words appear in the card as they are written (updated once per frame, not per piece).
      let raw = "";
      let frame = 0;
      const onDelta = (d: string) => {
        raw += d;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          update(t.id, { live: raw });
        });
      };
      const res = await awaitOrRecover(streamInjectPrompts({ characterId, targetPath: path, options: { ...o } }, onDelta), async () => {
        const r = await recoverInjectPrompts({ characterId, targetPath: path, since, count: o.count });
        return r.ok && r.result ? { ok: true as const, ...r.result } : null;
      }).catch((e: unknown): AiFailure => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't write the prompts. Try again." }));
      if (frame) cancelAnimationFrame(frame);
      update(t.id, { live: undefined });
      usageChanged();
      if (!res.ok) {
        if (res.redirectTo) {
          setRunning(false);
          return router.push(res.redirectTo);
        }
        update(t.id, { state: "error", status: res.error });
        if (res.stop) {
          stop.current = true;
          stoppedBecause = res.error;
        }
        continue;
      }
      const written = res.versions.filter(Boolean).length;
      done += written;
      update(t.id, {
        state: "done",
        characterId,
        writtenPath: path,
        versions: res.versions,
        status: res.truncated ? "Cut short. Try fewer versions or the Short style." : written < res.versions.length ? "Some versions were not written. Press Write prompts to try again." : "Done.",
      });
      if (n > 1) setSummary({ text: `Target ${i + 1} of ${n} done…`, good: true });
    }
    const total = n * o.count;
    setSummary({
      text: (total > 1 ? `${done} of ${total} prompts written.` : done ? "Done." : "No prompt was produced.") + (stoppedBecause ? ` Stopped early: ${stoppedBecause}` : ""),
      good: done > 0,
    });
    setRunning(false);
    router.refresh();
  }

  // Picking a different character after prompts were written rewrites them for her (artifact autoRewrite).
  useEffect(() => {
    if (!lastRunFor.current || lastRunFor.current === characterId || !character.ready) return;
    if (!targetsRef.current.some((t) => t.versions?.length)) return;
    show(`Rewriting the prompts for ${character.name}…`);
    if (running) {
      stop.current = true;
      rerunAfter.current = true;
      return;
    }
    const timer = setTimeout(() => void run(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);
  useEffect(() => {
    if (!running && rerunAfter.current) {
      rerunAfter.current = false;
      const timer = setTimeout(() => void run(), 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function extract() {
    const first = targets[0];
    if (!first) return;
    setExtracting(true);
    const path = await ensureUploaded(first);
    const res = path ? await extractOutfit({ imagePath: path, who: o.who }) : { ok: false as const, error: "Upload failed" };
    setExtracting(false);
    if (!res.ok) {
      if ("redirectTo" in res && res.redirectTo) return router.push(res.redirectTo);
      return show(res.error);
    }
    setO((x) => ({ ...x, exText: res.text, ward: "extracted" }));
    show("Outfit extracted. The prompts will use it.");
  }

  const results = targets.filter((t) => t.state);

  // Write only: what each target's finished prompts depend on. When any of it changes, they're made again.
  const standaloneKey = (t: Target) =>
    JSON.stringify([t.characterId ?? characterId, editTarget ? (t.writtenPath ?? t.path ?? null) : null, (t.versions ?? []).map((v) => v && [v.text, v.meta])]);
  const pendingKey = writeOnly ? results.filter((t) => t.state === "done" && t.versions?.some(Boolean)).map((t) => t.id + standaloneKey(t)).join("|") : "";
  useEffect(() => {
    if (!writeOnly) return;
    for (const t of targetsRef.current) {
      if (t.state !== "done" || !t.versions?.some(Boolean)) continue;
      const key = standaloneKey(t);
      if (standalone[t.id]?.key === key) continue;
      const written = t.versions.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const target = editTarget ? (t.writtenPath ?? t.path ?? null) : null;
      setStandalone((s) => ({ ...s, [t.id]: { key } }));
      void writeInjectStandalone({
        characterId: t.characterId ?? characterId,
        targetPath: target,
        cleaned: !!target && !!t.clean && target === t.clean.path,
        versions: written.map((i) => ({ text: t.versions![i]!.text, meta: t.versions![i]!.meta })),
      }).then((r) => {
        // Prompts placed back at their version numbers; an unwritten version has none.
        const prompts: StandalonePrompt[] = [];
        if (r.ok) written.forEach((vi, j) => (prompts[vi] = r.prompts[j]));
        setStandalone((s) => (s[t.id]?.key === key ? { ...s, [t.id]: r.ok ? { key, prompts } : { key, error: r.error } } : s));
      });
    }
    // Runs when a target's versions or the settings they depend on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, editTarget]);

  // How the prompts are used, and whether they edit the target: under Options on a phone, beside the button otherwise.
  const controls = (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{generation ? "How you'll use the prompts" : "Prompt options"}</legend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
{generation && (
            <div role="radiogroup" aria-label="What to do with the prompts" className={segTrack}>
              {([false, true] as const).map((w) => (
                <button
                  key={String(w)}
                  type="button"
                  role="radio"
                  aria-checked={writeOnly === w}
                  onClick={() => {
                    setWriteOnly(w);
                    try {
                      localStorage.setItem(WRITE_ONLY_KEY, w ? "1" : "0");
                    } catch {
                      // Not remembered in a private window.
                    }
                  }}
                  className={segItem(writeOnly === w)}
                >
                  {w ? "Write only" : "Generate here"}
                </button>
              ))}
            </div>
            )}
            {/* Recreate is the default: the target only guides the prompt. Edit (sending the photo itself) is opt-in. */}
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="How to use the target photo" className={segTrack}>
                {([false, true] as const).map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    role="radio"
                    aria-checked={editTarget === on}
                    onClick={() => {
                      if (on === editTarget) return;
                      if (on && !window.confirm("Edit this photo sends the target photo itself to the image model and changes it. Only use photos you took or have the rights to, never a real person without their consent. Continue?")) return;
                      setEditTarget(on);
                      writeEditTarget(on);
                    }}
                    className={segItem(editTarget === on)}
                  >
                    {on ? "Edit this photo" : "Recreate"}
                  </button>
                ))}
              </div>
              <InfoTip label="Recreate or edit">
                Recreate (the default): the target photo only guides the prompt writer, and a new image of her is made from her references in a similar scene, pose and style. Nothing from the photo itself is used. Edit this photo: the photo is sent with her references and she replaces the person in it, which keeps the scene exactly. Only for photos you have the rights to. You can switch after writing; the prompts update without writing again.
              </InfoTip>
            </div>
          </div>
        </fieldset>
  );

  return (
    <div className="mt-5 flex flex-col gap-4 max-sm:mt-4">
      {/* Phones: a paste box (long-press, Paste) with the options button beside it, like a search bar. */}
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 pl-4 pr-1.5 transition-colors focus-within:border-brand-500/70 sm:hidden">
        <PasteIcon className="h-5 w-5 shrink-0 text-neutral-500" />
        <input
          aria-label="Paste a target photo"
          placeholder="Long-press here to paste a photo"
          inputMode="none"
          value=""
          onChange={() => {}}
          onPaste={(e) => {
            e.preventDefault();
            addFiles(e.clipboardData.files);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
        />
        <button type="button" aria-label="Options" onClick={() => setSheet(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900 transition-transform active:scale-95">
          <SlidersIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] max-sm:flex max-sm:flex-col max-sm:gap-5 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="character" className="max-sm:font-display max-sm:text-base max-sm:font-bold">Character</Label>
            <Link href="/characters" className="text-xs text-neutral-400 hover:text-neutral-100 sm:hidden">See all</Link>
          </div>
          <CharacterPicker
            id="character"
            value={characterId}
            onChange={setCharacterId}
            characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "No images yet" }))}
          />
          {!character.ready ? (
            <p className="text-sm text-amber-400">
              Add a face sheet, body sheet or reference photo on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
            </p>
          ) : (
            !character.hasProfile && (
              <p className="text-sm text-amber-400">
                {character.name} has no profile yet, so the prompts can't describe her exactly. <Link href={`/characters/${character.id}`} className="underline">Build her profile</Link> first for the best results.
              </p>
            )
          )}
        </section>

        <section
          ref={targetBox}
          className="dropzone group flex cursor-pointer flex-col gap-2 p-4 max-sm:order-first max-sm:rounded-3xl max-sm:border-solid max-sm:border-neutral-800 max-sm:bg-[radial-gradient(120%_140%_at_100%_0%,rgb(232_38_94/0.28),transparent_55%),radial-gradient(90%_120%_at_0%_100%,rgb(91_91_246/0.18),transparent_60%),var(--color-neutral-900)]"
          tabIndex={0}
          aria-label="Target images"
          // Clicking anywhere on the box adds photos (the thumbnails' own buttons excepted).
          onClick={(e) => {
            if (!running && !(e.target as HTMLElement).closest("button")) input.current?.click();
          }}
          onPaste={(e) => addFiles(clipboardImages(e.clipboardData))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          {/* Phones, before any photo: a banner with her picture and one big Paste button. */}
          {!targets.length && (
            <div className="relative -m-4 flex min-h-[10rem] overflow-hidden rounded-3xl p-4 sm:hidden">
              <div className="relative z-10 flex max-w-[64%] flex-col items-start gap-2">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-100 ring-1 ring-white/15">Step 1</span>
                <h2 className="font-display text-[1.6rem] font-extrabold leading-[1.05] text-neutral-50">Add a photo you like</h2>
                <p className="text-xs leading-snug text-neutral-300">{character.name} goes into it, in the same pose, outfit and scene.</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" disabled={running} onClick={() => void pasteFromClipboard()} className="glow-brand flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition-transform active:scale-95">
                    <PasteIcon className="h-[18px] w-[18px]" /> Paste
                  </button>
                  <button type="button" disabled={running} onClick={() => input.current?.click()} className="flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 text-sm font-semibold text-neutral-100 ring-1 ring-white/15 transition-transform active:scale-95">
                    <UploadIcon className="h-[18px] w-[18px]" /> Upload
                  </button>
                </div>
              </div>
              {character.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.photo} alt="" className="pointer-events-none absolute bottom-0 right-0 h-full w-[45%] object-cover object-top [mask-image:linear-gradient(to_left,black_55%,transparent)]" />
              )}
            </div>
          )}
          {/* Phones, with photos: the count, and paste or upload more. */}
          {targets.length > 0 && (
            <div className="flex items-center justify-between gap-2 sm:hidden">
              <h2 className="font-display text-base font-bold">Target photos <span className="text-xs font-normal text-neutral-400">{targets.length} of {MAX_TARGETS}</span></h2>
              <div className="flex gap-1.5">
                <button type="button" aria-label="Paste another photo" disabled={running || targets.length >= MAX_TARGETS} onClick={() => void pasteFromClipboard()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white active:scale-95 disabled:opacity-50"><PasteIcon className="h-[18px] w-[18px]" /></button>
                <button type="button" aria-label="Upload another photo" disabled={running || targets.length >= MAX_TARGETS} onClick={() => input.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-neutral-100 ring-1 ring-white/15 active:scale-95 disabled:opacity-50"><UploadIcon className="h-[18px] w-[18px]" /></button>
              </div>
            </div>
          )}
          {pasteError && <p role="alert" className="text-xs text-amber-300">{pasteError}</p>}
          <div className="flex items-center justify-between gap-2 max-sm:hidden">
            <h2 className="font-semibold">1. Target images <span className="text-xs font-normal text-neutral-500">up to {MAX_TARGETS}</span></h2>
            <div className="flex gap-1.5">
              <button type="button" aria-label="Paste from the clipboard" title="Paste from the clipboard" disabled={running} onClick={() => void pasteFromClipboard()} className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800/70 text-neutral-200 transition-all hover:border-brand-500/60 hover:text-white active:scale-95 disabled:opacity-50"><PasteIcon className="h-[18px] w-[18px]" /></button>
              <Button type="button" size="sm" variant="secondary" disabled={running} onClick={() => input.current?.click()}>Add images</Button>
            </div>
          </div>
          <p className="-mt-1 text-xs text-neutral-500 max-sm:hidden">Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP.</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onClick={(e) => e.stopPropagation()} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <div className={`flex flex-wrap gap-2.5 ${targets.length ? "" : "max-sm:hidden"}`}>
            {targets.map((t) => (
              <div key={t.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.preview} alt="" className="thumb h-20 w-20 animate-pop-in object-cover ring-1 ring-white/10" />
                {o.clean && t.clean && t.clean.removed.length > 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-emerald-950/90 px-1.5 py-0.5 text-[10px] text-emerald-300" title={`Removed: ${t.clean.removed.join(", ")}`}>
                    Cleaned
                  </span>
                )}
                {!running && (
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setTargets((x) => x.filter((y) => y.id !== t.id))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-900"
                  >×</button>
                )}
              </div>
            ))}
            {targets.length < MAX_TARGETS && (
              <span
                aria-hidden="true"
                className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-neutral-700 text-2xl font-light text-neutral-500 transition-colors group-hover:border-brand-500/60 hover:border-brand-500/60 hover:text-brand-400"
              >
                +
              </span>
            )}
          </div>
        </section>
      </div>

      <MobileSheet open={sheet} onClose={() => setSheet(false)} title="Options" className="panel flex flex-col gap-4 p-4">
        <h2 className="font-semibold max-sm:hidden">2. Options</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5">Prompt for <InfoTip label="About Prompt for">With character sheet: the prompt opens with your reference tag, for generators that get her sheet. Text only: her identity is written out in full.</InfoTip></span>
            <select className={select} value={o.mode} onChange={(e) => set("mode", e.target.value as Options["mode"])}>
              <option value="ref">With character sheet</option>
              <option value="text">Text only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Style
            <select className={select} value={o.len} onChange={(e) => set("len", e.target.value as Options["len"])}>
              <option value="full">Sectioned</option>
              <option value="narrative">Narrative</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Pose
            <select className={select} value={o.poseMode} onChange={(e) => set("poseMode", e.target.value as Options["poseMode"])}>
              <option value="keep">Keep the target's pose</option>
              <option value="natural">Natural pose</option>
              <option value="social">Random social pose</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Versions per target
            <select className={select} value={o.count} onChange={(e) => set("count", Number(e.target.value))}>
              {Array.from({ length: MAX_VERSIONS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Wardrobe
            <select className={select} value={o.ward} onChange={(e) => set("ward", e.target.value as Options["ward"])}>
              <option value="match">Match the target</option>
              <option value="signature">Her signature style</option>
              <option value="extracted">Extracted outfit</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5">Which person <span className="text-xs text-neutral-500">optional</span></span>
            <Input value={o.who} maxLength={200} onChange={(e) => set("who", e.target.value)} placeholder='e.g. "the woman on the left"' />
          </label>
        </div>

        {o.ward === "extracted" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="outfit">Outfit</Label>
              <Button type="button" size="sm" variant="secondary" onClick={extract} disabled={extracting || running || !targets.length}>
                {extracting ? "Reading the outfit…" : "Extract from the first target"}
              </Button>
            </div>
            <Textarea id="outfit" value={o.exText} maxLength={2000} onChange={(e) => set("exText", e.target.value)} placeholder="Describe the outfit, or extract it from a target photo." />
            <div className="flex flex-wrap items-center gap-2">
              <Input value={outfitName} maxLength={60} onChange={(e) => setOutfitName(e.target.value)} placeholder="Name, e.g. Black gym set" aria-label="Outfit name" className="max-w-56" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!outfitName.trim() || !o.exText.trim()}
                onClick={async () => {
                  const r = await saveOutfit({ name: outfitName, text: o.exText });
                  if (!r.ok) return show(r.error);
                  setOutfits((list) => [r.outfit, ...list]);
                  setOutfitName("");
                  show("Outfit saved.");
                }}
              >
                Save outfit
              </Button>
            </div>
            {outfits.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Saved outfits">
                {outfits.map((x) => (
                  <span key={x.id} className={`flex items-center gap-1 rounded-full border pl-2.5 pr-1 text-xs transition-colors ${o.exText === x.text ? "border-brand-500/70 bg-brand-500/15" : "border-neutral-700 hover:border-neutral-500"}`}>
                    <button type="button" className="py-1" title={x.text} onClick={() => setO((v) => ({ ...v, exText: x.text, ward: "extracted" }))}>{x.name}</button>
                    <button
                      type="button"
                      aria-label={`Delete outfit ${x.name}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-700"
                      onClick={() => {
                        if (!window.confirm(`Delete the outfit "${x.name}"?`)) return;
                        setOutfits((list) => list.filter((y) => y.id !== x.id));
                        void deleteOutfit(x.id);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15">
            <input type="checkbox" checked={o.newOutfit} onChange={(e) => set("newOutfit", e.target.checked)} /> Change outfit
          </label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15 ${o.newOutfit ? "opacity-50" : ""}`}>
            <input type="checkbox" checked={o.recolor && !o.newOutfit} disabled={o.newOutfit} onChange={(e) => set("recolor", e.target.checked)} /> Recolour clothes
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15">
            <input type="checkbox" checked={o.hair} onChange={(e) => set("hair", e.target.checked)} /> Hairstyle variant
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15">
            <input type="checkbox" checked={o.clean} onChange={(e) => set("clean", e.target.checked)} /> Clean up overlays
            <InfoTip label="About cleaning up overlays">Removes app buttons, watermarks, usernames, stickers and captions laid on top of a screenshot before the prompt is written: cropped off when they sit clear of the person, painted over otherwise. Your original is kept.</InfoTip>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span>Extra direction <span className="text-xs text-neutral-500">optional</span></span>
          <Textarea value={o.extra} maxLength={2000} onChange={(e) => set("extra", e.target.value)} placeholder="Anything else for every prompt, e.g. golden hour light" />
        </label>

        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-400">More options</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={o.withRefs} onChange={(e) => set("withRefs", e.target.checked)} /> Also send her reference photos to the prompt writer
              <InfoTip label="About sending reference photos">The writer always gets her profile and her sheet's words. Sending her photos too can help with marks and details, and costs more.</InfoTip>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5">Reference tag <InfoTip label="About the reference tag">What the prompt calls her sheet in your own generator, with "With character sheet". Generate here handles it for you.</InfoTip></span>
              <Input value={o.tag} maxLength={40} onChange={(e) => set("tag", e.target.value)} className="max-w-40" />
            </label>
          </div>
        </details>
        {phone && <div className="border-t border-neutral-800 pt-4">{controls}</div>}
      </MobileSheet>

      <div className="panel flex flex-wrap items-end justify-between gap-4 p-4 max-sm:flex-nowrap max-sm:rounded-3xl max-sm:p-2">
        {!phone && controls}

        <div className="flex flex-wrap items-center gap-3 max-sm:w-full max-sm:flex-nowrap max-sm:gap-2">
          <button type="button" onClick={() => setSheet(true)} className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-800/60 px-4 text-sm font-semibold text-neutral-100 transition-transform active:scale-95 sm:hidden">
            <SlidersIcon className="h-[18px] w-[18px]" /> Options
          </button>
          <Button type="button" size="lg" onClick={() => void run()} disabled={running || !targets.length || !character.ready} className="max-sm:h-12 max-sm:flex-1 max-sm:rounded-2xl">
            {running ? "Writing..." : "Write prompts"}
          </Button>
          {running && (
            <Button type="button" variant="secondary" onClick={() => { stop.current = true; rerunAfter.current = false; }}>Stop</Button>
          )}
          {summary && <p role="status" className={`text-sm max-sm:hidden ${summary.good ? "text-neutral-300" : "text-red-400"}`}>{summary.text}</p>}
        </div>
      </div>
      {summary && <p role="status" className={`-mt-2 px-1 text-sm sm:hidden ${summary.good ? "text-neutral-300" : "text-red-400"}`}>{summary.text}</p>}

      {results.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium">Prompts</h2>
          {writeOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-neutral-500">
                Finished prompts to paste into another generator: her look, the realism and the rules are written in. Attach the images shown on each one, in that order.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const all = results.flatMap((t, ti) =>
                    (t.versions ?? []).flatMap((v, k) => {
                      const p = standalone[t.id]?.key === standaloneKey(t) ? standalone[t.id]?.prompts?.[k] : undefined;
                      if (!v || !p) return [];
                      const name = `Target ${ti + 1}${(t.versions?.length ?? 0) > 1 ? ` · version ${k + 1}` : ""}`;
                      return [`${name}\nAttach: ${p.attach.join(", ")}\n${p.copy}`];
                    }),
                  );
                  if (!all.length) return show("Still finishing the prompts.");
                  void navigator.clipboard.writeText(all.join("\n\n"));
                  show("Copied.");
                }}
              >
                Copy all
              </Button>
            </div>
          )}
          {results.map((t, ti) =>
            (t.versions?.length ? t.versions : [null]).map((v, k) => {
              const label = (results.length > 1 ? `Target ${ti + 1} of ${results.length}` : "Target") + (o.count > 1 && t.versions ? ` · version ${k + 1}` : "");
              const sa = writeOnly && v ? standalone[t.id] : undefined;
              const ready = sa?.key === standaloneKey(t) ? sa.prompts?.[k] : undefined;
              return (
                <article key={`${t.id}-${k}`} className="panel flex animate-fade-up flex-col gap-3 p-5 max-sm:rounded-3xl max-sm:p-4">
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.preview} alt={`Target ${ti + 1}`} className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="text-sm">{label}</b>
                      <span role="status" className={`text-xs ${t.state === "error" ? "text-red-400" : "text-neutral-400"}`}>
                        {v ? t.status : t.state === "done" ? "This version was not written. Press Write prompts to try again." : t.status}
                      </span>
                      {o.clean && t.clean && t.clean.removed.length > 0 && <span className="text-xs text-emerald-300">Cleaned. Removed: {t.clean.removed.join(", ")}</span>}
                      {t.state === "busy" && t.live && <LiveText text={liveText(t.live)} />}
                    </div>
                    {v && (
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        {!writeOnly && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(v.text);
                              show("Copied.");
                            }}
                          >
                            Copy
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            try {
                              sessionStorage.setItem(SEND_TO_LIKENESS_KEY, JSON.stringify({ characterId: t.characterId ?? characterId, prompt: v.text }));
                            } catch {
                              // The page still opens; the prompt just isn't filled in.
                            }
                            router.push("/likeness");
                          }}
                        >
                          Check likeness
                        </Button>
                      </div>
                    )}
                  </div>
                  {v && writeOnly && (
                    <>
                      {ready ? (
                        <>
                          <AttachStrip items={ready.attachItems} photo={t.preview} />
                          <CopyOpen text={ready.copy} />
                          <div className="max-h-96 overflow-auto text-sm">
                            <TaggedPrompt text={ready.copy} />
                          </div>
                        </>
                      ) : sa?.error && sa.key === standaloneKey(t) ? (
                        <p role="alert" className="text-sm text-red-400">{sa.error}</p>
                      ) : (
                        <p className="text-sm text-neutral-400">Finishing the prompt...</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {v.tags.map((x) => <span key={x} className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{x}</span>)}
                      </div>
                    </>
                  )}
                  {v && !writeOnly && (
                    <>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{v.text}</pre>
                      <div className="flex flex-wrap gap-1.5">
                        {v.tags.map((x) => <span key={x} className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{x}</span>)}
                        <span className={`rounded-full px-2 py-0.5 text-xs ${v.fixed.length ? "bg-amber-950 text-amber-300" : "bg-emerald-950 text-emerald-300"}`}>
                          {v.fixed.length ? `Auto-fixed: ${v.fixed.join(", ")}` : "All checks passed"}
                        </span>
                      </div>
                      <GenerateImage
                        prompt={v.text}
                        characterId={t.characterId ?? characterId}
                        extraPaths={[]}
                        kind="inject"
                        meta={metaForRun(v.meta, t.writtenPath ?? t.path ?? null, editTarget)}
                        autoAspectRatio={t.ratio}
                        historyId={v.historyId}
                      />
                    </>
                  )}
                </article>
              );
            }),
          )}
        </section>
      )}
      {toast}
    </div>
  );
}

/** The prompt as the model writes it, kept scrolled to the newest words, with a blinking cursor. */
function LiveText({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text]);
  return (
    <div
      ref={box}
      aria-live="off"
      className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-mono text-xs leading-relaxed text-neutral-300"
    >
      {text}
      <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-brand-400 align-middle" />
    </div>
  );
}
