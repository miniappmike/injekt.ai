"use client";

import { usageChanged } from "@/lib/panel-events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { clipboardImages, usePasteTarget } from "@/components/paste-router";
import { FixRun, type ImageRef } from "@/components/likeness-panel";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { CopyOpen } from "@/components/copy-open";
import { PasteIcon } from "@/components/icons";
import { readClipboardImages } from "@/lib/clipboard";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { REFERENCES_RUN, type RevisedRun } from "@/lib/revised-run";
import { checkLikeness } from "@/app/(app)/likeness/actions";
import type { LikenessReport } from "@/lib/ai/prompts/likeness";
import { SEND_TO_LIKENESS_KEY } from "@/lib/likeness-link";
import { CharacterPicker } from "@/components/character-picker";
import { tokenGate } from "@/components/out-of-tokens";


interface Round {
  n: number;
  image: ImageRef;
  characterId: string;
  preview: string;
  report: LikenessReport;
}

interface Picked {
  preview: string;
  file?: File;
  /** Set once uploaded, or from the start for a generated image. */
  image?: ImageRef;
}

export function LikenessChecker({
  characters,
  initialCharacterId,
  generated,
}: {
  characters: { id: string; name: string; ready: boolean; photo?: string | null }[];
  initialCharacterId?: string;
  /** A generated image opened from "See likeness". */
  generated?: { id: string; url: string; prompt?: string; run?: RevisedRun } | null;
}) {
  const router = useRouter();
  const generation = useGeneration();
  const [pasteError, setPasteError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const [characterId, setCharacterId] = useState(initialCharacterId ?? characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [picked, setPicked] = useState<Picked | null>(generated ? { preview: generated.url, image: { generationId: generated.id } } : null);
  const [promptUsed, setPromptUsed] = useState(generated?.prompt ?? "");
  // How "Generate" on a revised prompt runs: like the prompt the image came from, else her references alone.
  const revisedRunWith = generated?.run ?? REFERENCES_RUN;
  const top = useRef<HTMLElement>(null);
  // Score rounds per character (R1 · 72 → R2 · 86), as in the artifact.
  const [rounds, setRounds] = useState<Round[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; good: boolean }>();
  const [fix, setFix] = useState<null | { kind: "likeness_fix" | "face_fix"; n: number }>(null);
  const { toast, show } = useToast(2000);

  const character = characters.find((c) => c.id === characterId)!;
  const mine = rounds.filter((r) => r.characterId === characterId);
  const latest = mine[mine.length - 1];

  // A prompt sent from an Inject card: pick her and fill in the prompt.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SEND_TO_LIKENESS_KEY);
      if (!raw) return;
      sessionStorage.removeItem(SEND_TO_LIKENESS_KEY);
      const sent = JSON.parse(raw) as { characterId?: string; prompt?: string };
      if (sent.characterId && characters.some((c) => c.id === sent.characterId)) setCharacterId(sent.characterId);
      if (sent.prompt) setPromptUsed(sent.prompt.slice(0, 6000));
    } catch {
      // Nothing was sent.
    }
  }, [characters]);

  usePasteTarget(top, (f) => pick(f), busy);
  function pick(files: FileList | File[] | null) {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) setPicked({ file: f, preview: URL.createObjectURL(f) });
  }

  async function run() {
    if (!picked) return;
    setBusy(true);
    setStatus({ text: "Comparing the faces trait by trait…", good: true });
    setFix(null);
    try {
      const image = picked.image ?? { path: await uploadImage(picked.file as File, "target") };
      setPicked({ ...picked, image });
      const res = await checkLikeness({ characterId, image, promptUsed });
      usageChanged();
      if (!res.ok) {
        if (res.redirectTo) return router.push(res.redirectTo);
        return setStatus({ text: tokenGate(res.error), good: false });
      }
      setRounds((r) => [...r, { n: r.filter((x) => x.characterId === characterId).length + 1, image, characterId, preview: picked.preview, report: res.report }]);
      setStatus(
        res.report.overall >= 85
          ? { text: "Strong match. Keep this prompt.", good: true }
          : { text: "Use the fixes, generate again, then drop the new image here and check again.", good: true },
      );
      // The next attempt is a new image: clear the slot so it is obvious the old one was already checked.
      setPicked(null);
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "Something went wrong", good: false });
    } finally {
      setBusy(false);
    }
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    show("Copied");
  };
  const fixes = latest ? latest.report.traits.filter((t) => t.fix) : [];

  return (
    <div className="mt-5 flex flex-col gap-4">
      {toast}
      <div className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section
          ref={top}
          className="dropzone group flex cursor-pointer flex-col gap-2.5 p-3"
          tabIndex={0}
          aria-label="Generated image"
          onClick={(e) => {
            if (!busy && !(e.target as HTMLElement).closest("button")) input.current?.click();
          }}
          onPaste={(e) => pick(clipboardImages(e.clipboardData))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files);
          }}
        >
          <div className={`w-full ${picked ? "aspect-[4/3] max-sm:aspect-[4/5] max-sm:max-h-[55dvh]" : "aspect-[4/3] max-sm:aspect-[2/1]"}`}>
            {picked ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.preview} alt="Image to check" className="h-full w-full animate-pop-in rounded-lg object-cover ring-1 ring-white/10" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-neutral-950/50 text-neutral-500 transition-colors group-hover:text-brand-400">
                <span className="text-3xl font-light leading-none">+</span>
                <span className="text-xs">Drop the image to check</span>
              </div>
            )}
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Generated image</h2>
              <p className="text-xs text-neutral-500"><span className="max-sm:hidden">Click, drop, or paste with Ctrl+V. </span>After each check, add your next attempt to see the score change.</p>
              {pasteError && <p role="alert" className="mt-1 text-xs text-amber-300">{pasteError}</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                aria-label="Paste the image from the clipboard"
                title="Paste from the clipboard"
                disabled={busy}
                onClick={async () => {
                  try {
                    pick(await readClipboardImages());
                    setPasteError(undefined);
                  } catch (err) {
                    setPasteError(err instanceof Error ? err.message : "Couldn't paste.");
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800/70 text-neutral-200 transition-all hover:border-brand-500/60 hover:text-white active:scale-95 disabled:opacity-50 sm:h-8 sm:w-8"
              >
                <PasteIcon className="h-[18px] w-[18px]" />
              </button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} className="max-sm:h-9" onClick={() => input.current?.click()}>
                {picked ? "Replace" : <><span className="sm:hidden">Upload</span><span className="max-sm:hidden">Add image</span></>}
              </Button>
            </div>
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onClick={(e) => e.stopPropagation()} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </section>

        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-1.5">
            <Label htmlFor="character">Character</Label>
            <CharacterPicker
              id="character"
              value={characterId}
              onChange={setCharacterId}
              characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "No images yet" }))}
            />
            {!character.ready && (
              <p className="text-sm text-amber-400">
                Add reference images on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
              </p>
            )}
          </section>

          <section className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="prompt-used">Prompt you used <span className="text-xs font-normal text-neutral-500">optional, for a revised prompt</span></Label>
            <Textarea id="prompt-used" value={promptUsed} onChange={(e) => setPromptUsed(e.target.value)} maxLength={6000} className="flex-1" />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" className="max-sm:w-full" onClick={run} disabled={busy || !picked || !character.ready}>
              {busy ? "Comparing..." : "Check likeness"}
            </Button>
            {status && <p role="status" className={`text-sm ${status.good ? "text-neutral-300" : "text-red-400"}`}>{status.text}</p>}
          </div>
        </div>
      </div>

      {latest && (
        <section className="stagger flex flex-col gap-4">
          <p className="text-sm text-neutral-300" aria-label="Rounds">
            {mine.map((r, i) => (
              <span key={r.n} className={r === latest ? "font-semibold text-brand-300" : "text-neutral-400"}>
                {i > 0 && " → "}R{r.n} · {r.report.overall}
              </span>
            ))}
          </p>

          <Card className="overflow-hidden bg-[radial-gradient(120%_140%_at_100%_0%,rgb(232_38_94/0.12),transparent_55%),rgb(29_29_34/0.8)]">
            <CardContent className="flex flex-wrap items-center gap-5 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.preview} alt="" className="thumb h-28 w-28 shrink-0 object-cover ring-1 ring-white/10" />
              <ScoreRing score={latest.report.overall} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Likeness <span className="normal-case tracking-normal">/ 100</span></p>
                <p className="mt-1 text-[15px] leading-relaxed text-neutral-200">{latest.report.verdict}</p>
              </div>
            </CardContent>
          </Card>

          {/* Trait cards two or three across on wide screens. */}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {latest.report.traits.map((t) => (
            <Card key={t.name}>
              <CardContent className="flex flex-col gap-1 pt-5 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{t.name}</span>
                  <span className={`font-display font-bold ${t.score >= 9 ? "text-emerald-300" : t.score >= 7 ? "text-amber-300" : "text-brand-400"}`}>{t.score}/10</span>
                </div>
                <div className="mb-1.5"><ScoreBar score={t.score} /></div>
                {t.reference && <p><span className="text-neutral-500">Reference:</span> {t.reference}</p>}
                {t.generated && <p><span className="text-neutral-500">Generated:</span> {t.generated}</p>}
                {t.fix && (
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p><span className="text-neutral-500">Fix:</span> {t.fix}</p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => copy(t.fix)}>Copy</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          </div>

          {generation && (<Card>
            <CardContent className="flex flex-col gap-3 pt-5 text-sm">
              <span className="font-medium">Fix this image</span>
              <p className="text-neutral-400">Repaint her from her references, or repaint only her face. The result is checked against this image.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setFix({ kind: "likeness_fix", n: latest.n })}>Fix the likeness</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setFix({ kind: "face_fix", n: latest.n })}>Fix only her face</Button>
              </div>
              {fix && fix.n === latest.n && (
                <FixRun
                  key={fix.kind}
                  kind={fix.kind}
                  characterId={latest.characterId}
                  source={latest.image}
                  fixes={fixes.map((t) => t.fix).slice(0, 6)}
                />
              )}
            </CardContent>
          </Card>)}

          {latest.report.editPrompt && (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Edit prompt</span>
                  {generation && <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.editPrompt)}>Copy</Button>}
                </div>
                {!generation && (
                  <>
                    <p className="text-xs text-neutral-500">Paste with the image you checked attached, to fix it in place.</p>
                    <CopyOpen text={latest.report.editPrompt} />
                  </>
                )}
                <p className="whitespace-pre-wrap">{latest.report.editPrompt}</p>
              </CardContent>
            </Card>
          )}

          {latest.report.revisedPrompt && (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Revised prompt</span>
                  <div className="flex gap-2">
                    {generation && <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.revisedPrompt)}>Copy</Button>}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setPromptUsed(latest.report.revisedPrompt);
                        show(generation ? "Loaded. Generate with it, then check the new image." : "Loaded. Make the new image with it, then check it here.");
                      }}
                    >
                      Use for next round
                    </Button>
                  </div>
                </div>
                {!generation && <CopyOpen text={latest.report.revisedPrompt} />}
                <p className="whitespace-pre-wrap">{latest.report.revisedPrompt}</p>
                {generation && <div className="border-t border-neutral-800 pt-3">
                  <GenerateImage
                    key={`${latest.n}-${characterId}`}
                    prompt={latest.report.revisedPrompt}
                    characterId={characterId}
                    extraPaths={revisedRunWith.extraPaths}
                    kind={revisedRunWith.kind}
                    meta={revisedRunWith.meta}
                    actionLabel="Generate with revised prompt"
                    checkLikeness={false}
                    renderActions={(result) => (
                      <div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            // Next round: this image, with the prompt that made it.
                            setPicked({ preview: result.url, image: { generationId: result.generationId } });
                            setPromptUsed(latest.report.revisedPrompt);
                            top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            show("Loaded. Press Check likeness to score it.");
                          }}
                        >
                          Check this image
                        </Button>
                      </div>
                    )}
                  />
                  <p className="mt-2 text-xs text-neutral-500">{revisedRunWith.note}</p>
                </div>}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-neutral-500">Reports are saved in History.</p>
        </section>
      )}
    </div>
  );
}
