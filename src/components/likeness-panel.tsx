"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenerateImage } from "@/components/generate-image";
import { quickLikeness } from "@/app/(app)/likeness/actions";
import type { QuickLikeness } from "@/lib/ai/prompts/likeness";

/** An image to check or fix: a generated image, or an uploaded one. */
export interface ImageRef {
  generationId?: string;
  path?: string;
}

const tenths = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Runs a likeness fix (repaint the person) or a face fix (repaint only the face) on an image. The server writes the
 * prompt from her references; the result is checked against the original and says whether it got closer to her.
 */
export function FixRun({
  kind,
  characterId,
  source,
  fixes,
  frame,
  matchHair,
  note,
}: {
  kind: "likeness_fix" | "face_fix";
  characterId: string;
  source: ImageRef;
  fixes?: string[];
  frame?: string;
  matchHair?: boolean;
  note?: string;
}) {
  return (
    <GenerateImage
      prompt={kind === "face_fix" ? "Face fix" : "Likeness fix"}
      characterId={characterId}
      extraPaths={source.path ? [source.path] : []}
      kind={kind}
      meta={{ ...(source.generationId ? { sourceGeneration: source.generationId } : {}), fixes, frame, matchHair, note }}
      actionLabel={kind === "face_fix" ? "Fix her face" : "Fix the likeness"}
      autoStart
      compareTo={source}
    />
  );
}

/**
 * The quick likeness score under a generated image of her (artifact quickLike): a match score out of 100, per-part
 * scores, what was hidden, and buttons to fix it. With `original`, this image is a fix and gets a verdict.
 */
export function LikenessPanel({ characterId, image, original, frame }: { characterId: string; image: ImageRef; original?: ImageRef; frame?: string }) {
  const [state, setState] = useState<{ busy: boolean; result?: QuickLikeness; error?: string }>({ busy: true });
  const [fix, setFix] = useState<null | "likeness_fix" | "face_fix">(null);
  const [faceOpts, setFaceOpts] = useState<{ open: boolean; hair: boolean; note: string }>({ open: false, hair: false, note: "" });
  const [faceRun, setFaceRun] = useState<{ hair: boolean; note: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void quickLikeness({ characterId, image, original }).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ busy: false, result: r.result });
      else setState({ busy: false, error: r.error });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, image.generationId, image.path]);

  if (state.busy) return <p className="text-xs text-neutral-500" role="status">Checking the likeness…</p>;
  if (state.error) {
    return (
      <p className="text-xs text-neutral-500" role="status">
        Likeness not checked: {state.error}
      </p>
    );
  }
  const r = state.result!;
  const ok = r.score != null && r.score >= 85;
  const parts = [
    r.sc.face != null && `Face ${tenths(r.sc.face)}/10`,
    r.sc.hair != null && `Hair ${tenths(r.sc.hair)}/10`,
    r.sc.skin != null && `Skin ${tenths(r.sc.skin)}/10`,
    r.sc.body != null && `Body ${tenths(r.sc.body)}/10`,
  ].filter(Boolean);
  const seeHref = `/likeness?character=${encodeURIComponent(characterId)}${image.generationId ? `&generation=${encodeURIComponent(image.generationId)}` : ""}`;
  const canFace = r.sc.face != null && r.sc.face < 9;
  const canFix = r.score != null && r.score < 90 && r.fixes.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-800 p-3 text-sm" aria-label="Likeness">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.score == null ? "bg-neutral-800 text-neutral-300" : ok ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
          {r.score == null ? "Not scored" : `Match ${r.score}`}
        </span>
        {r.verdict && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${r.verdict === "better" ? "bg-emerald-950 text-emerald-300" : r.verdict === "worse" ? "bg-red-950 text-red-300" : "bg-neutral-800 text-neutral-300"}`}
            title={r.why}
          >
            {r.verdict === "better" ? "Closer to her than the original" : r.verdict === "worse" ? "Further from her than the original" : "About the same as the original"}
          </span>
        )}
        {parts.length > 0 && <span className="text-xs text-neutral-400">{parts.join(" · ")}</span>}
      </div>
      {r.why && <p className="text-xs text-neutral-400">{r.why}</p>}
      {r.hidden.length > 0 && <p className="text-xs text-neutral-500">Not scored (hidden): {r.hidden.join(", ")}</p>}
      {r.fixes.length > 0 && <p className="text-xs text-neutral-400">To fix: {r.fixes.join("; ")}</p>}
      <div className="flex flex-wrap gap-2">
        <Link href={seeHref} className="inline-flex h-8 items-center rounded-md px-3 text-sm text-neutral-200 hover:bg-neutral-800">See likeness</Link>
        {canFace && (
          <Button type="button" size="sm" variant="secondary" aria-expanded={faceOpts.open} onClick={() => setFaceOpts((o) => ({ ...o, open: !o.open }))}>
            Face fix
          </Button>
        )}
        {canFix && (
          <Button type="button" size="sm" variant="secondary" disabled={fix === "likeness_fix"} onClick={() => setFix("likeness_fix")}>
            Fix
          </Button>
        )}
      </div>
      {faceOpts.open && !faceRun && (
        <div className="flex flex-col gap-2 rounded-md bg-neutral-900 p-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={faceOpts.hair} onChange={(e) => setFaceOpts((o) => ({ ...o, hair: e.target.checked }))} />
            Also match her hair colour and hairline
          </label>
          <Input value={faceOpts.note} maxLength={160} onChange={(e) => setFaceOpts((o) => ({ ...o, note: e.target.value }))} placeholder="Note (optional), e.g. keep the smile" aria-label="Face fix note" />
          <div>
            <Button type="button" size="sm" onClick={() => setFaceRun({ hair: faceOpts.hair, note: faceOpts.note.trim() })}>Fix only her face</Button>
          </div>
        </div>
      )}
      {faceRun && <FixRun kind="face_fix" characterId={characterId} source={image} frame={frame} matchHair={faceRun.hair} note={faceRun.note || undefined} />}
      {fix === "likeness_fix" && <FixRun kind="likeness_fix" characterId={characterId} source={image} fixes={r.fixes} frame={frame} />}
    </div>
  );
}
