"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerateImage } from "@/components/generate-image";
import { InfoTip } from "@/components/info-tip";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { deleteOutfit, extractOutfit, saveOutfit, warmSheetPack, writeInjectPrompts } from "@/app/(app)/inject/actions";
import type { SavedOutfit } from "@/lib/outfits";
import { INJECT_DEFAULTS, MAX_VERSIONS, metaForRun, readEditTarget, writeEditTarget, type InjectMeta, type InjectOptionsInput } from "@/lib/inject-meta";
import { closestAspectRatio } from "@/lib/aspect";
import { SEND_TO_LIKENESS_KEY } from "@/lib/likeness-link";
import type { ImageAspectRatio } from "@/lib/ai/providers/types";

const MAX_TARGETS = 10;
const OPTIONS_KEY = "ms.injectOptions";
const select = "h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm";

export interface InjectCharacter {
  id: string;
  name: string;
  ready: boolean;
  /** A saved profile; without one the prompts can only describe her from the sheet's words. */
  hasProfile: boolean;
}

interface Version {
  text: string;
  fixed: string[];
  tags: string[];
  meta: InjectMeta;
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
  versions?: (Version | null)[];
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

export function InjectWriter({ characters, outfits: initialOutfits = [] }: { characters: InjectCharacter[]; outfits?: SavedOutfit[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { toast, show } = useToast();
  const [characterId, setCharacterId] = useState(characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [targets, setTargets] = useState<Target[]>([]);
  const [o, setO] = useState<Options>({ ...INJECT_DEFAULTS });
  const [editTarget, setEditTarget] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ text: string; good: boolean }>();
  const [extracting, setExtracting] = useState(false);
  const [outfits, setOutfits] = useState<SavedOutfit[]>(initialOutfits);
  const [outfitName, setOutfitName] = useState("");
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
      const path = await ensureUploaded(t);
      if (!path) continue;
      const res = await writeInjectPrompts({ characterId, targetPath: path, options: { ...o } });
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

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character</Label>
        <select id="character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className={select}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : " (no images yet)"}</option>
          ))}
        </select>
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
        className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-700 p-4"
        tabIndex={0}
        aria-label="Target images"
        onPaste={(e) => addFiles(e.clipboardData.files)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">1. Target images <span className="text-xs font-normal text-neutral-500">up to {MAX_TARGETS}</span></h2>
          <Button type="button" size="sm" variant="secondary" disabled={running} onClick={() => input.current?.click()}>Add images</Button>
        </div>
        <p className="text-xs text-neutral-500">Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-wrap gap-3">
          {targets.map((t) => (
            <div key={t.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.preview} alt="" className="h-24 w-24 rounded-md object-cover" />
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
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">2. Options</h2>
        <div className="grid gap-4 sm:grid-cols-2">
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
                  <span key={x.id} className={`flex items-center gap-1 rounded-full border pl-2.5 pr-1 text-xs ${o.exText === x.text ? "border-neutral-300 bg-neutral-800" : "border-neutral-700"}`}>
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

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={o.newOutfit} onChange={(e) => set("newOutfit", e.target.checked)} /> Change outfit
          </label>
          <label className={`flex items-center gap-2 ${o.newOutfit ? "opacity-50" : ""}`}>
            <input type="checkbox" checked={o.recolor && !o.newOutfit} disabled={o.newOutfit} onChange={(e) => set("recolor", e.target.checked)} /> Recolour clothes
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={o.hair} onChange={(e) => set("hair", e.target.checked)} /> Hairstyle variant
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
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void run()} disabled={running || !targets.length || !character.ready}>
          {running ? "Writing..." : "Write prompts"}
        </Button>
        {running && (
          <Button type="button" variant="secondary" onClick={() => { stop.current = true; rerunAfter.current = false; }}>Stop</Button>
        )}
        {summary && <p role="status" className={`text-sm ${summary.good ? "text-neutral-300" : "text-red-400"}`}>{summary.text}</p>}
      </div>

      {results.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Prompts</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editTarget} onChange={(e) => { setEditTarget(e.target.checked); writeEditTarget(e.target.checked); }} />
              Edit the target photo
              <InfoTip label="About editing the target photo">Sends the target photo with her references so the model swaps her into the real photo, which holds her body much closer to the sheet. Off: the written prompt is generated from her references alone.</InfoTip>
            </label>
          </div>
          {results.map((t, ti) =>
            (t.versions?.length ? t.versions : [null]).map((v, k) => {
              const label = (results.length > 1 ? `Target ${ti + 1} of ${results.length}` : "Target") + (o.count > 1 && t.versions ? ` · version ${k + 1}` : "");
              return (
                <article key={`${t.id}-${k}`} className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4">
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.preview} alt={`Target ${ti + 1}`} className="h-14 w-14 shrink-0 rounded object-cover" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="text-sm">{label}</b>
                      <span role="status" className={`text-xs ${t.state === "error" ? "text-red-400" : "text-neutral-400"}`}>
                        {v ? t.status : t.state === "done" ? "This version was not written. Press Write prompts to try again." : t.status}
                      </span>
                    </div>
                    {v && (
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        <Button type="button" size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(v.text); show("Copied."); }}>Copy</Button>
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
                  {v && (
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
                        meta={metaForRun(v.meta, t.path ?? null, editTarget)}
                        autoAspectRatio={t.ratio}
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
