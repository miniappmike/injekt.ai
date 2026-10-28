"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { uploadImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { FixRun, type ImageRef } from "@/components/likeness-panel";
import { GenerateImage } from "@/components/generate-image";
import { REFERENCES_RUN, type RevisedRun } from "@/lib/revised-run";
import { checkLikeness } from "@/app/(app)/likeness/actions";
import type { LikenessReport } from "@/lib/ai/prompts/likeness";
import { SEND_TO_LIKENESS_KEY } from "@/lib/likeness-link";


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
  characters: { id: string; name: string; ready: boolean }[];
  initialCharacterId?: string;
  /** A generated image opened from "See likeness". */
  generated?: { id: string; url: string; prompt?: string; run?: RevisedRun } | null;
}) {
  const router = useRouter();
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
      if (!res.ok) {
        if (res.redirectTo) return router.push(res.redirectTo);
        return setStatus({ text: res.error, good: false });
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
    <div className="mt-6 flex flex-col gap-6">
      {toast}
      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character</Label>
        <select id="character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm">
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : " (no images yet)"}</option>
          ))}
        </select>
        {!character.ready && (
          <p className="text-sm text-amber-400">
            Add reference images on <Link href={`/characters/${character.id}`} className="underline">the character page</Link> first.
          </p>
        )}
      </section>

      <section
        ref={top}
        className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-700 p-4"
        tabIndex={0}
        aria-label="Generated image"
        onPaste={(e) => pick(e.clipboardData.files)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Generated image</h2>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {picked ? "Replace" : "Add image"}
          </Button>
        </div>
        <p className="text-xs text-neutral-500">Click, drop, or paste with Ctrl+V. After each check, drop your next attempt to see the score change.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        {picked && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.preview} alt="Image to check" className="h-40 w-40 rounded-md object-cover" />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="prompt-used">Prompt you used <span className="text-xs font-normal text-neutral-500">optional, for a revised prompt</span></Label>
        <Textarea id="prompt-used" value={promptUsed} onChange={(e) => setPromptUsed(e.target.value)} maxLength={6000} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={run} disabled={busy || !picked || !character.ready}>
          {busy ? "Comparing..." : "Check likeness"}
        </Button>
        {status && <p role="status" className={`text-sm ${status.good ? "text-neutral-300" : "text-red-400"}`}>{status.text}</p>}
      </div>

      {latest && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-neutral-300" aria-label="Rounds">
            {mine.map((r, i) => (
              <span key={r.n} className={r === latest ? "font-semibold text-neutral-100" : "text-neutral-400"}>
                {i > 0 && " → "}R{r.n} · {r.report.overall}
              </span>
            ))}
          </p>

          <Card>
            <CardContent className="flex gap-4 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.preview} alt="" className="h-24 w-24 shrink-0 rounded-md object-cover" />
              <div>
                <p className="text-3xl font-semibold">{latest.report.overall}<span className="text-base font-normal text-neutral-400"> / 100</span></p>
                <p className="mt-1 text-sm text-neutral-300">{latest.report.verdict}</p>
              </div>
            </CardContent>
          </Card>

          {latest.report.traits.map((t) => (
            <Card key={t.name}>
              <CardContent className="flex flex-col gap-1 pt-5 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{t.name}</span>
                  <span className={t.score >= 9 ? "text-emerald-300" : t.score >= 7 ? "text-neutral-300" : "text-amber-300"}>{t.score}/10</span>
                </div>
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

          <Card>
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
          </Card>

          {latest.report.editPrompt && (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Edit prompt</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.editPrompt)}>Copy</Button>
                </div>
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
                    <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.revisedPrompt)}>Copy</Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setPromptUsed(latest.report.revisedPrompt);
                        show("Loaded. Generate with it, then check the new image.");
                      }}
                    >
                      Use for next round
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap">{latest.report.revisedPrompt}</p>
                <div className="border-t border-neutral-800 pt-3">
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
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-neutral-500">Reports are saved in History.</p>
        </section>
      )}
    </div>
  );
}
