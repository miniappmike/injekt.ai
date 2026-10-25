"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { checkImageGeneration, quoteImageGeneration, startImageGeneration } from "@/app/(app)/generate/actions";
import { openHistory } from "@/lib/panel-events";
import { GENERATION_RETENTION_HOURS } from "@/lib/retention";
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS, type ImageAspectRatio, type ImageOutputFormat, type ImageResolution } from "@/lib/ai/providers/types";

type Phase = "idle" | "starting" | "running" | "done" | "failed";
interface Result {
  generationId: string;
  url: string;
  downloadUrl: string;
}

const POLL_MS = 3000;
const MAX_POLLS = 150; // about 7 minutes
const select = "h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm";

/**
 * Turns a prompt into an image. The pictures it uses are the character's references first, then `extraPaths`,
 * which is the order the prompts were written for (@image1, @image2, ...).
 */
export function GenerateImage({
  prompt,
  characterId,
  extraPaths,
  kind,
  freeImagesLeft = null,
  aspectRatio: lockedAspectRatio,
  defaultResolution = "1k",
  actionLabel = "Generate image",
  renderActions,
}: {
  prompt: string;
  characterId?: string | null;
  extraPaths: string[];
  kind: "inject" | "direct_swap" | "edit" | "variant" | "carousel" | "face_fix" | "reference_sheet";
  /** Free plan: images left (generated at 1k, no price shown). `null` means a Pro or admin account. */
  freeImagesLeft?: number | null;
  /** Fixes the shape and hides its choice (a sheet has a set layout). */
  aspectRatio?: ImageAspectRatio;
  /** The size to start on; a free account always gets 1k. */
  defaultResolution?: ImageResolution;
  /** What the button says before the price, for example "Make face sheet". */
  actionLabel?: string;
  /** Extra controls shown under the finished image, such as saving it somewhere. */
  renderActions?: (result: Result) => React.ReactNode;
}) {
  const router = useRouter();
  const free = freeImagesLeft !== null;
  const [resolution, setResolution] = useState<ImageResolution>(defaultResolution);
  const [chosenAspectRatio, setAspectRatio] = useState<ImageAspectRatio>("auto");
  const aspectRatio = lockedAspectRatio ?? chosenAspectRatio;
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("jpeg");
  const [price, setPrice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = { kind, characterId: characterId ?? null, extraPaths, prompt, resolution: free ? "1k" : resolution, aspectRatio, outputFormat };
  const requestKey = JSON.stringify(request);

  // Show the price before anything is spent. Free images have no price, and a failed lookup just hides it.
  useEffect(() => {
    setPrice(null);
    if (free || !prompt.trim() || !extraPaths.length) return;
    const t = setTimeout(async () => {
      const q = await quoteImageGeneration(JSON.parse(requestKey));
      if (alive.current && q.ok) setPrice(q.estimatedCost);
    }, 400);
    return () => clearTimeout(t);
  }, [requestKey, free, prompt, extraPaths.length]);

  async function generate() {
    setPhase("starting");
    setMessage(undefined);
    setResult(null);
    const started = await startImageGeneration(request);
    if (!started.ok) {
      if (started.redirectTo) return router.push(started.redirectTo);
      setPhase("failed");
      return setMessage(started.error);
    }
    setPhase("running");
    for (let i = 0; i < MAX_POLLS && alive.current; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) return;
      const status = await checkImageGeneration(started.generationId);
      if (!status.ok) {
        setPhase("failed");
        return setMessage(status.error);
      }
      if (status.state === "complete") {
        setResult({ generationId: started.generationId, url: status.url, downloadUrl: status.downloadUrl });
        setPhase("done");
        router.refresh();
        return;
      }
      if (status.state === "failed") {
        setPhase("failed");
        return setMessage(status.error);
      }
    }
    setPhase("failed");
    setMessage("Still working on it. It will show up in History, under Images, when it's ready.");
  }

  const busy = phase === "starting" || phase === "running";
  const label = free ? `Generate my free image (${freeImagesLeft} left)` : `${actionLabel}${price ? ` · about $${Number(price).toFixed(3)}` : ""}`;

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-800 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-neutral-400">
          Size
          <select className={select} value={free ? "1k" : resolution} disabled={free || busy} onChange={(e) => setResolution(e.target.value as ImageResolution)}>
            {IMAGE_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {!lockedAspectRatio && (
          <label className="flex items-center gap-1.5 text-neutral-400">
            Shape
            <select className={select} value={aspectRatio} disabled={busy} onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}>
              {IMAGE_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r === "auto" ? "match the photo" : r}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-neutral-400">
          Format
          <select className={select} value={outputFormat} disabled={busy} onChange={(e) => setOutputFormat(e.target.value as ImageOutputFormat)}>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </label>
      </div>
      {free && <p className="text-xs text-neutral-500">Your free image is made at 1k, and you can only make one.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={generate} disabled={busy || !prompt.trim() || !extraPaths.length}>
          {phase === "starting" ? "Starting..." : phase === "running" ? "Generating..." : label}
        </Button>
        {phase === "running" && <p className="text-xs text-neutral-500">This usually takes under a minute. Once started, it can't be cancelled.</p>}
        {message && <p role="alert" className="text-sm text-red-400">{message}</p>}
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt="Generated" className="max-h-96 w-auto max-w-full rounded-md" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a href={result.downloadUrl} className="text-neutral-100 underline">Download</a>
            <button type="button" onClick={() => openHistory("images")} className="text-neutral-400 underline">All images</button>
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              Kept for {GENERATION_RETENTION_HOURS} hours
              <InfoTip label="About expiry">Generated images are deleted {GENERATION_RETENTION_HOURS} hours after they are created. Download any you want to keep.</InfoTip>
            </span>
          </div>
          {renderActions?.(result)}
        </div>
      )}
    </div>
  );
}
