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
import { addToReferences, swapPromptFor } from "@/app/(app)/inject/actions";

export interface QuickCharacter {
  id: string;
  name: string;
  /** How many reference images the character has. */
  refCount: number;
  /** The references Edit can send after the target: her crops, sheets and photos, with the default picks. */
  refOptions?: { id: string; label: string; on: boolean }[];
}

type Photo = { preview: string; path?: string; error?: string; busy?: boolean };
const EDIT_PROMPT_KEY = "ms.editPrompt";
const PROMPT_MAX = 5000;
const MAX_EDIT_EXTRAS = 2;

/**
 * "Direct swap" swaps her straight into a photo with the artifact's fixed swap prompt (the photo first, her references
 * after it). "Edit" sends your own prompt: the photo as @image1, then the references you pick, then extra images.
 */
export function QuickGenerate({ mode, characters, freeImagesLeft }: { mode: "direct_swap" | "edit"; characters: QuickCharacter[]; freeImagesLeft: number | null }) {
  const router = useRouter();
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
      return show(r.error);
    }
    setEditPrompt(r.text.slice(0, PROMPT_MAX));
  }

  const characterSelect = (
    <section className="flex flex-col gap-2">
      <Label htmlFor="qg-character">Character{mode === "edit" ? <span className="text-xs font-normal text-neutral-500"> optional</span> : null}</Label>
      <select id="qg-character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
        {mode === "edit" && <option value="">No character</option>}
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
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      {toast}
      {characterSelect}

      <ImageDrop
        title={mode === "edit" ? "Target photo (optional)" : "Target photo"}
        preview={photo?.preview}
        disabled={photo?.busy}
        onPick={(f) => upload(f, setPhoto)}
        hint={mode === "edit" ? "The photo to edit, sent as @image1. Leave it empty to make an image from her references alone." : "The photo to put your character into. Click, drop, or paste with Ctrl+V."}
      />
      {photo?.busy && <p className="-mt-4 text-xs text-neutral-500">Uploading...</p>}
      {photo?.error && <p role="alert" className="-mt-4 text-sm text-red-400">{photo.error}</p>}

      {mode === "direct_swap" ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-neutral-400">
            Swaps her straight into the photo: the photo goes first, then her face and body references, with a fixed swap prompt. No prompt-writing step. For a prompt tailored to the photo, use Write prompts.
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
                  <label key={o.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${picked.has(o.id) ? "border-neutral-300 bg-neutral-800" : "border-neutral-700 text-neutral-400"}`}>
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
            <div className="grid gap-3 sm:grid-cols-2">
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
                  <button key={t.tag} type="button" onClick={() => insertTag(t.tag)} className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-700" title={`Insert ${t.tag}`}>
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

      {mode === "direct_swap" ? (
        <GenerateImage
          prompt="Direct swap"
          characterId={characterId || null}
          extraPaths={[]}
          kind="direct_swap"
          meta={photo?.path && refCount ? { target: photo.path, who: who.trim() || undefined, extra: extra.trim() || undefined } : undefined}
          freeImagesLeft={freeImagesLeft}
          renderActions={(r) => (characterId ? <AddToReferences generationId={r.generationId} characterId={characterId} /> : null)}
        />
      ) : (
        <GenerateImage
          prompt={editPrompt}
          characterId={characterId || null}
          extraPaths={extraPaths}
          kind="edit"
          meta={{ ...(photo?.path ? { target: photo.path } : {}), refs: characterId ? [...picked] : [] }}
          freeImagesLeft={freeImagesLeft}
        />
      )}
    </div>
  );
}

function AddToReferences({ generationId, characterId }: { generationId: string; characterId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; done?: boolean; error?: string }>({});
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={state.busy || state.done}
        onClick={async () => {
          setState({ busy: true });
          const r = await addToReferences({ generationId, characterId });
          setState(r.ok ? { done: true } : { error: r.error });
          if (r.ok) router.refresh();
        }}
      >
        {state.done ? "Added to her reference photos" : state.busy ? "Adding..." : "Add to reference photos"}
      </Button>
      {state.error && <span role="alert" className="text-red-400">{state.error}</span>}
    </div>
  );
}
