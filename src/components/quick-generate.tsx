"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerateImage } from "@/components/generate-image";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { swapPromptFor, writeSwapStandalone } from "@/app/(app)/inject/actions";
import { useGeneration } from "@/components/app-context";
import { CopyOpen } from "@/components/copy-open";
import { AttachStrip, TaggedPrompt } from "@/components/attach-strip";
import type { StandalonePrompt } from "@/lib/inject-standalone";
import { chipItem } from "@/components/ui/segmented";
import { CharacterPicker } from "@/components/character-picker";
import { tokenGate } from "@/components/out-of-tokens";

export interface QuickCharacter {
  id: string;
  name: string;
  /** How many reference images the character has. */
  refCount: number;
  /** The references Edit can send after the target: her crops, sheets and photos, with the default picks. */
  refOptions?: { id: string; label: string; on: boolean }[];
  /** Her picture in the character picker. */
  photo?: string | null;
}

type Photo = { preview: string; path?: string; error?: string; busy?: boolean };
const EDIT_PROMPT_KEY = "ms.editPrompt";
const PROMPT_MAX = 5000;
const MAX_EDIT_EXTRAS = 2;

/**
 * "Direct swap" swaps her straight into a photo with the artifact's fixed swap prompt (the photo first, her references
 * after it). "Edit" sends your own prompt: the photo as @image1, then the references you pick, then extra images.
 */
export function QuickGenerate({ mode, characters }: { mode: "direct_swap" | "edit"; characters: QuickCharacter[] }) {
  const router = useRouter();
  const generation = useGeneration();
  const [swap, setSwap] = useState<{ busy?: boolean; prompt?: StandalonePrompt; error?: string }>({});
  const { toast, show } = useToast(2500);
  const [characterId, setCharacterId] = useState(characters.find((c) => c.refCount > 0)?.id ?? characters[0]?.id ?? "");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [extras, setExtras] = useState<(Photo | null)[]>(Array(MAX_EDIT_EXTRAS).fill(null));
  const [who, setWho] = useState("");
  const [extra, setExtra] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const character = characters.find((c) => c.id === characterId);
  const refCount = character?.refCount ?? 0;
  const options = character?.refOptions ?? [];

  // Her default references, picked again whenever she changes.
  useEffect(() => {
    setPicked(new Set(options.filter((o) => o.on).map((o) => o.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  // The Edit prompt is kept between visits (artifact autosave).
  useEffect(() => {
    if (mode !== "edit") return;
    try {
      setEditPrompt(localStorage.getItem(EDIT_PROMPT_KEY) ?? "");
    } catch {
      // Not available in a private window.
    }
  }, [mode]);
  useEffect(() => {
    if (mode !== "edit") return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(EDIT_PROMPT_KEY, editPrompt);
      } catch {
        // Not saved; the page still works.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [editPrompt, mode]);

  async function upload(file: File, set: (p: Photo) => void) {
    const preview = URL.createObjectURL(file);
    set({ preview, busy: true });
    try {
      set({ preview, path: await uploadImage(file, "target") });
    } catch (e) {
      set({ preview, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  if (!characters.length && mode === "direct_swap") {
    return (
      <p className="mt-6 text-neutral-400">
        You need a character first. <Link href="/characters/new" className="underline">Create one</Link>.
      </p>
    );
  }

  // @image order for Edit: the photo, the references picked (in their listed order), then the extra images.
  const extraPaths = extras.filter((x): x is Photo & { path: string } => !!x?.path).map((x) => x.path);
  const tags = [
    ...(photo?.path ? ["target photo"] : []),
    ...options.filter((o) => picked.has(o.id) && characterId).map((o) => o.label),
    ...extraPaths.map((_, i) => `extra image ${i + 1}`),
  ].map((label, i) => ({ tag: `@image${i + 1}`, label }));

  function insertTag(tag: string) {
    const el = area.current;
    const at = el ? el.selectionStart : editPrompt.length;
    const end = el ? el.selectionEnd : editPrompt.length;
    const next = (editPrompt.slice(0, at) + tag + editPrompt.slice(end)).slice(0, PROMPT_MAX);
    setEditPrompt(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length, at + tag.length);
    });
  }

  async function startFromSwap() {
    if (!characterId) return;
    if (editPrompt.trim() && !window.confirm("Replace your prompt with the swap prompt?")) return;
    setStarting(true);
    const r = await swapPromptFor({ characterId, refs: [...picked] });
    setStarting(false);
    if (!r.ok) {
      if (r.redirectTo) return router.push(r.redirectTo);
      return show(tokenGate(r.error));
    }
    setEditPrompt(r.text.slice(0, PROMPT_MAX));
  }

  const characterSelect = (
    <section className="flex flex-col gap-2">
      <Label htmlFor="qg-character">Character{mode === "edit" ? <span className="text-xs font-normal text-neutral-500"> optional</span> : null}</Label>
      <CharacterPicker
        id="qg-character"
        value={characterId}
        onChange={setCharacterId}
        none={mode === "edit" ? { label: "No character" } : undefined}
        characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.refCount ? undefined : "No images yet" }))}
      />
      {refCount === 0 && character && (
        <p className="text-sm text-amber-400">
          Add a face sheet, body sheet or reference photo on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
        </p>
      )}
    </section>
  );

  return (
    <div className="mt-5 flex flex-col gap-4">
      {toast}
      {characterSelect}

      <ImageDrop
        title={mode === "edit" || !generation ? "Target photo (optional)" : "Target photo"}
        preview={photo?.preview}
        disabled={photo?.busy}
        onPick={(f) => upload(f, setPhoto)}
        hint={mode === "edit" ? "The photo to edit, sent as @image1. Leave it empty to make an image from her references alone." : generation ? "The photo to put your character into. Click, drop, or paste with Ctrl+V." : "Only to show it in the list of images to attach. The prompt is the same either way."}
      />
      {photo?.busy && <p className="-mt-4 text-xs text-neutral-500">Uploading...</p>}
      {photo?.error && <p role="alert" className="-mt-4 text-sm text-red-400">{photo.error}</p>}

      {mode === "direct_swap" ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-neutral-400">
            {generation
              ? "Swaps her straight into the photo: the photo goes first, then her face and body references, with a fixed swap prompt. No prompt-writing step. For a prompt tailored to the photo, use Write prompts."
              : "A ready-made swap prompt that puts her into any photo, keeping its pose, outfit and background. Instant and free: it doesn't use any of your daily prompts. For a prompt tailored to the photo, use Write prompts."}
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Which person <span className="text-xs text-neutral-500">optional</span></span>
            <Input value={who} maxLength={200} onChange={(e) => setWho(e.target.value)} placeholder='e.g. "on the left"' />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Extra direction <span className="text-xs text-neutral-500">optional, added if it fits</span></span>
            <Textarea value={extra} maxLength={2000} onChange={(e) => setExtra(e.target.value)} />
          </label>
        </section>
      ) : (
        <>
          {characterId && options.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Her references to send</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <label key={o.id} className={chipItem(picked.has(o.id))}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={picked.has(o.id)}
                      onChange={() =>
                        setPicked((s) => {
                          const next = new Set(s);
                          if (!next.delete(o.id)) next.add(o.id);
                          return next;
                        })
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <section className="flex flex-col gap-2" aria-label="Extra images">
            <h2 className="text-sm font-medium">More images <span className="text-xs font-normal text-neutral-500">optional, up to {MAX_EDIT_EXTRAS}, sent after her references</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              {extras.map((x, i) => (
                <ImageDrop key={i} title={`Extra image ${i + 1}`} preview={x?.preview} disabled={x?.busy} onPick={(f) => upload(f, (p) => setExtras((l) => l.map((o, j) => (j === i ? p : o))))} />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="qg-prompt">Your prompt</Label>
              {characterId && picked.size > 0 && (
                <Button type="button" size="sm" variant="secondary" disabled={starting} onClick={startFromSwap}>
                  {starting ? "Writing..." : "Start from the swap prompt"}
                </Button>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Insert an image tag">
                {tags.map((t) => (
                  <button key={t.tag} type="button" onClick={() => insertTag(t.tag)} className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-neutral-200 transition-all hover:border-brand-500/60 hover:bg-brand-500/15 hover:text-neutral-50 active:scale-95" title={`Insert ${t.tag}`}>
                    {t.tag} · {t.label}
                  </button>
                ))}
              </div>
            )}
            <Textarea id="qg-prompt" ref={area} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} maxLength={PROMPT_MAX} rows={6} />
            <p className={`text-xs ${editPrompt.length > PROMPT_MAX - 200 ? "text-amber-400" : "text-neutral-500"}`}>
              {editPrompt.length} / {PROMPT_MAX}
              {photo?.path ? " · Her makeup in the photo is kept unless your prompt asks to change it." : ""}
            </p>
          </section>
        </>
      )}

      {mode === "direct_swap" && !generation ? (
        <section className="flex flex-col gap-3">
          <div>
            <Button
              type="button"
              size="lg"
              disabled={!characterId || !refCount || swap.busy}
              onClick={async () => {
                setSwap({ busy: true });
                const r = await writeSwapStandalone({ characterId, who: who.trim() || undefined, extra: extra.trim() || undefined });
                if (!r.ok && r.redirectTo) return router.push(r.redirectTo);
                setSwap(r.ok ? { prompt: r.prompt } : { error: tokenGate(r.error) });
              }}
            >
              {swap.busy ? "Writing..." : swap.prompt ? "Write it again" : "Write swap prompt"}
            </Button>
          </div>
          {swap.error && <p role="alert" className="text-sm text-red-400">{swap.error}</p>}
          {swap.prompt && (
            <article className="panel flex animate-fade-up flex-col gap-3 p-5">
              <AttachStrip items={swap.prompt.attachItems} photo={photo?.preview ?? ""} />
              <CopyOpen text={swap.prompt.copy} />
              <div className="max-h-96 overflow-auto text-sm">
                <TaggedPrompt text={swap.prompt.copy} />
              </div>
            </article>
          )}
        </section>
      ) : mode === "direct_swap" ? (
        <GenerateImage
          prompt="Direct swap"
          characterId={characterId || null}
          extraPaths={[]}
          kind="direct_swap"
          meta={photo?.path && refCount ? { target: photo.path, who: who.trim() || undefined, extra: extra.trim() || undefined } : undefined}
        />
      ) : (
        <GenerateImage
          prompt={editPrompt}
          characterId={characterId || null}
          extraPaths={extraPaths}
          kind="edit"
          meta={{ ...(photo?.path ? { target: photo.path } : {}), refs: characterId ? [...picked] : [] }}
        />
      )}
    </div>
  );
}
