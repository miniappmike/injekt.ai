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
import { useToast } from "@/components/toast";
import { notifySpend } from "@/lib/spend-events";
import { checkLikeness } from "@/app/(app)/likeness/actions";
import type { LikenessReport } from "@/lib/ai/tasks/likeness";

interface Round {
  n: number;
  path: string;
  characterId: string;
  preview: string;
  report: LikenessReport;
}

export function LikenessChecker({ characters }: { characters: { id: string; name: string; ready: boolean }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [characterId, setCharacterId] = useState(characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [file, setFile] = useState<{ file: File; preview: string; path?: string } | null>(null);
  const [promptUsed, setPromptUsed] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { toast, show } = useToast(2000);

  const character = characters.find((c) => c.id === characterId)!;
  const latest = rounds[rounds.length - 1];

  function pick(files: FileList | File[] | null) {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) setFile({ file: f, preview: URL.createObjectURL(f) });
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const path = file.path ?? (await uploadImage(file.file, "target"));
      setFile({ ...file, path });
      const res = await checkLikeness({ characterId, imagePath: path, promptUsed });
      notifySpend();
      if (!res.ok) {
        if (res.redirectTo) return router.push(res.redirectTo);
        return setError(res.error);
      }
      setRounds((r) => [...r, { n: r.length + 1, path, characterId, preview: file.preview, report: res.report }]);
      // The next attempt is a new image: clear the slot so it is obvious the old one was already checked.
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    show("Copied");
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {toast}
      <section className="flex flex-col gap-2">
        <Label htmlFor="character">Character</Label>
        <select
          id="character"
          value={characterId}
          onChange={(e) => {
            setCharacterId(e.target.value);
            setRounds([]);
          }}
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
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
        className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-700 p-4"
        tabIndex={0}
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
            {file ? "Replace" : "Add image"}
          </Button>
        </div>
        <p className="text-xs text-neutral-500">Click, drop, or paste with Ctrl+V. After each check, drop your next attempt to see the score change.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        {file && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.preview} alt="Image to check" className="h-40 w-40 rounded-md object-cover" />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="prompt-used">Prompt you used <span className="text-xs font-normal text-neutral-500">optional</span></Label>
        <Textarea id="prompt-used" value={promptUsed} onChange={(e) => setPromptUsed(e.target.value)} maxLength={4000} />
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={run} disabled={busy || !file || !character.ready}>
          {busy ? "Comparing the faces trait by trait..." : "Check likeness"}
        </Button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
      <div className="-mt-4"><CostHint feature="likeness" /></div>

      {latest && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {rounds.map((r) => (
              <span
                key={r.n}
                className={`rounded-full border px-3 py-1 text-sm ${r === latest ? "border-neutral-300 text-neutral-100" : "border-neutral-700 text-neutral-400"}`}
              >
                R{r.n} · {r.report.overall}
              </span>
            ))}
          </div>

          <Card>
            <CardContent className="flex gap-4 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.preview} alt="" className="h-24 w-24 shrink-0 rounded-md object-cover" />
              <div>
                <p className="text-3xl font-semibold">{latest.report.overall}<span className="text-base font-normal text-neutral-400"> / 100</span></p>
                <p className="mt-1 text-sm text-neutral-300">{latest.report.summary}</p>
              </div>
            </CardContent>
          </Card>

          {latest.report.traits.map((t) => (
            <Card key={t.name}>
              <CardContent className="flex flex-col gap-1 pt-5 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-neutral-300">{t.score}/10</span>
                </div>
                <p><span className="text-neutral-500">Reference:</span> {t.reference}</p>
                <p><span className="text-neutral-500">Generated:</span> {t.generated}</p>
                {t.fix && (
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p><span className="text-neutral-500">Fix:</span> {t.fix}</p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => copy(t.fix)}>Copy</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {latest.report.fixPhrases.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Fix phrases</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.fixPhrases.join(" "))}>Copy all</Button>
                </div>
                <ul className="list-disc pl-5">
                  {latest.report.fixPhrases.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {latest.report.editPrompt && (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Edit prompt for the generated image</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(latest.report.editPrompt)}>Copy</Button>
                </div>
                <p className="whitespace-pre-wrap">{latest.report.editPrompt}</p>
                <GenerateImage prompt={latest.report.editPrompt} characterId={latest.characterId} extraPaths={[latest.path]} kind="face_fix" />
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-neutral-500">Use the fixes, generate again, drop the new image, and check again. Reports are saved in History.</p>
        </section>
      )}
    </div>
  );
}
