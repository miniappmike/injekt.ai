"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CostHint } from "@/components/cost-hint";
import { GenerateImage } from "@/components/generate-image";
import { uploadImage } from "@/components/image-slot";
import { notifySpend } from "@/lib/spend-events";
import { writeReplacementPrompts } from "@/app/(app)/characters/ai-actions";
import type { PromptStyle } from "@/lib/ai/tasks/prompt-writer";

const MAX_TARGETS = 10;

interface Target {
  id: string;
  file: File;
  preview: string;
  path?: string;
  /** The character the prompt was written for, so generating uses the same one even if the picker changes. */
  characterId?: string;
  prompt?: string;
  error?: string;
}

export function InjectWriter({ characters }: { characters: { id: string; name: string; ready: boolean }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [characterId, setCharacterId] = useState(characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [targets, setTargets] = useState<Target[]>([]);
  const [outfit, setOutfit] = useState("");
  const [style, setStyle] = useState<PromptStyle>("sectioned");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const character = characters.find((c) => c.id === characterId)!;

  function addFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const room = MAX_TARGETS - targets.length;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setTargets((t) => [...t, ...added]);
  }

  const update = (id: string, patch: Partial<Target>) => setTargets((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function run() {
    setBusy(true);
    setMessage(undefined);
    try {
      // Upload (and strip metadata from) each target that is not stored yet.
      const ready: { id: string; path: string }[] = [];
      for (const t of targets) {
        if (t.path) {
          ready.push({ id: t.id, path: t.path });
          continue;
        }
        try {
          const path = await uploadImage(t.file, "target");
          update(t.id, { path, error: undefined });
          ready.push({ id: t.id, path });
        } catch (e) {
          update(t.id, { error: e instanceof Error ? e.message : "Upload failed" });
        }
      }
      if (!ready.length) return setMessage("None of the images could be uploaded.");

      const res = await writeReplacementPrompts({ characterId, targetPaths: ready.map((t) => t.path), outfit, style });
      notifySpend();
      if (!res.ok) {
        if (res.redirectTo) return router.push(res.redirectTo);
        return setMessage(res.error);
      }
      for (const r of res.results) {
        const t = ready.find((x) => x.path === r.path);
        if (t) update(t.id, { prompt: r.prompt, error: r.error, characterId });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character</Label>
        <select
          id="character"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : " (no images yet)"}</option>
          ))}
        </select>
        {!character.ready && (
          <p className="text-sm text-amber-400">
            Add a face sheet, body sheet or reference photo on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
          </p>
        )}
      </section>

      <section
        className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-700 p-4"
        tabIndex={0}
        onPaste={(e) => addFiles(e.clipboardData.files)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">1. Target images <span className="text-xs font-normal text-neutral-500">up to {MAX_TARGETS}</span></h2>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>Add images</Button>
        </div>
        <p className="text-xs text-neutral-500">Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-wrap gap-3">
          {targets.map((t) => (
            <div key={t.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.preview} alt="" className="h-24 w-24 rounded-md object-cover" />
              {!busy && (
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

      <section className="flex flex-col gap-2">
        <Label htmlFor="outfit">2. Outfit <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <Textarea id="outfit" value={outfit} onChange={(e) => setOutfit(e.target.value)} maxLength={1000} placeholder="Leave empty to keep what the target shows" />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="style">3. Prompt setup</Label>
        <select
          id="style"
          value={style}
          onChange={(e) => setStyle(e.target.value as PromptStyle)}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          <option value="sectioned">Sectioned</option>
          <option value="match">Match the target</option>
        </select>
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={run} disabled={busy || !targets.length || !character.ready}>
          {busy ? "Writing..." : "Write replacement prompt"}
        </Button>
        {message && <p role="alert" className="text-sm text-red-400">{message}</p>}
      </div>
      <div className="-mt-4"><CostHint feature="prompt" count={Math.max(targets.length, 1)} /></div>

      {targets.some((t) => t.prompt || t.error) && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium">Replacement prompts</h2>
          {targets.map((t, i) =>
            t.prompt || t.error ? (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-2 pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-400">Image {i + 1}</span>
                    {t.prompt && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(t.prompt!)}>Copy</Button>
                    )}
                  </div>
                  {t.prompt ? <pre className="whitespace-pre-wrap text-sm">{t.prompt}</pre> : <p className="text-sm text-red-400">{t.error}</p>}
                  {t.prompt && t.path && (
                    <GenerateImage prompt={t.prompt} characterId={t.characterId ?? characterId} extraPaths={[t.path]} kind="inject" />
                  )}
                </CardContent>
              </Card>
            ) : null,
          )}
        </section>
      )}
    </div>
  );
}
