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
import { VARIANT_OPTIONS, type VariantOptionId } from "@/lib/ai/tasks/variants";

type Mode = "edits" | "carousel";
interface Item {
  title: string;
  prompt: string;
}
interface Result {
  items: Item[];
  attach: string[];
  /** The uploaded image the prompts refer to, and the character they were written for. */
  path: string;
  characterId: string | null;
  mode: Mode;
}

export function VariantsTool({ characters }: { characters: { id: string; name: string; ready: boolean }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("edits");
  const [characterId, setCharacterId] = useState("");
  const [image, setImage] = useState<{ file: File; preview: string; path?: string } | null>(null);
  const [options, setOptions] = useState<Set<VariantOptionId>>(new Set(["pose", "camera"]));
  const [slides, setSlides] = useState(5);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  // Goes up by one each time "Generate all" is pressed; every slide or variant that hasn't run yet starts.
  const [runAll, setRunAll] = useState(0);
  const { toast, show } = useToast(2000);

  const character = characters.find((c) => c.id === characterId);
  const noRefs = !!character && !character.ready;

  const toggle = (id: VariantOptionId) =>
    setOptions((s) => {
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
    setError(undefined);
    try {
      const path = image.path ?? (await uploadImage(image.file, "target"));
      setImage({ ...image, path });
      const common = { characterId: characterId || null, note };
      const res =
        mode === "edits"
          ? await writeVariantEdits({ imagePath: path, options: [...options], ...common })
          : await planCarousel({ coverPath: path, slides, ...common });
      if (!res.ok) {
        if (res.redirectTo) return router.push(res.redirectTo);
        return setError(res.error);
      }
      setResult({
        path,
        characterId: characterId || null,
        mode,
        attach: res.attach,
        items: "variants" in res ? res.variants.map((v) => ({ title: v.label, prompt: v.prompt })) : res.slides,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

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
              setError(undefined);
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

      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <select
          id="character"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          <option value="">No character, use the image only</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : " (no images yet)"}</option>
          ))}
        </select>
        {noRefs && (
          <p className="text-sm text-amber-400">
            Add reference images on <Link href={`/characters/${character!.id}`} className="underline">the character page</Link> first, or pick no character.
          </p>
        )}
      </section>

      {mode === "edits" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">What should change</legend>
          <div className="flex flex-wrap gap-2">
            {VARIANT_OPTIONS.map((o) => (
              <label
                key={o.id}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${options.has(o.id) ? "border-neutral-300 bg-neutral-800" : "border-neutral-700 text-neutral-400"}`}
              >
                <input type="checkbox" className="sr-only" checked={options.has(o.id)} onChange={() => toggle(o.id)} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <section className="flex flex-col gap-2">
          <Label htmlFor="slides">Slides (including the cover)</Label>
          <select
            id="slides"
            value={slides}
            onChange={(e) => setSlides(Number(e.target.value))}
            className="h-9 w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
          >
            {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Label htmlFor="note">{mode === "edits" ? "Note" : "Theme"} <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={run} disabled={busy || !image || noRefs || (mode === "edits" && options.size === 0)}>
          {busy ? "Writing..." : mode === "edits" ? "Write variant edits" : "Plan carousel"}
        </Button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>

      {result && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{mode === "edits" ? "Variant edits" : "Carousel plan"}</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const n = result.items.length;
                  if (window.confirm(`Generate all ${n} ${mode === "edits" ? "variants" : "slides"}? This starts ${n} images on your Image key; each one's price is shown on its own button.`)) setRunAll((v) => v + 1);
                }}
              >
                Generate all
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => copy(result.items.map((i) => i.prompt).join("\n\n"))}>Copy all</Button>
            </div>
          </div>
          <p className="text-xs text-neutral-500">Attach the images in this order: {result.attach.join(", ")}.</p>
          {result.items.map((item, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{mode === "carousel" ? `Slide ${i + 2} · ` : ""}{item.title}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => copy(item.prompt)}>Copy</Button>
                </div>
                <p className="whitespace-pre-wrap">{item.prompt}</p>
                <GenerateImage
                  prompt={item.prompt}
                  characterId={result.characterId}
                  extraPaths={[result.path]}
                  kind={result.mode === "edits" ? "variant" : "carousel"}
                  runSignal={runAll}
                />
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-neutral-500">Saved in History.</p>
        </section>
      )}
    </div>
  );
}
