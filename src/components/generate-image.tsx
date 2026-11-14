"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useApp, useGeneration } from "@/components/app-context";
import { IMAGE_CREDITS } from "@/lib/plans";
import { TokenCost } from "@/components/token-icon";
import { InfoTip } from "@/components/info-tip";
import { Spinner } from "@/components/ui/spinner";
import { checkImageGeneration, findGenerationByRef, quoteImageGeneration, startImageGeneration } from "@/app/(app)/generate/actions";
import { awaitOrRecover } from "@/lib/recoverable";
import type { AiFailure } from "@/lib/ai/failure";
import { openHistory, reportGeneration, viewImage } from "@/lib/panel-events";
import { featureLabel } from "@/lib/ledger-types";
import { GENERATION_RETENTION_HOURS } from "@/lib/retention";
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS, type ImageAspectRatio, type ImageOutputFormat, type ImageResolution } from "@/lib/ai/providers/types";
import type { InjectMeta } from "@/lib/inject-meta";
import { LikenessPanel, type ImageRef } from "@/components/likeness-panel";
import { PinToReferences } from "@/components/pin-to-references";
import { reportModelRefused, usePageModelForRequest } from "@/lib/page-model";
import { checkGeneration, POLL_MS } from "@/lib/generation-check";
import { forgetGeneration, latestForRequest, rememberGeneration, requestHash, waitOrWake } from "@/lib/pending-generations";
import { tokenGate } from "@/components/out-of-tokens";

type Phase = "idle" | "starting" | "running" | "done" | "failed";
interface Result {
  generationId: string;
  url: string;
  downloadUrl: string;
}

const MAX_POLLS = 53; // about 7 minutes
const select = "h-8 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-2 text-sm";

/**
 * Turns a prompt into an image. The pictures it uses are the character's references first, then `extraPaths`,
 * which is the order the prompts were written for (@image1, @image2, ...). An Inject prompt passes `meta` instead, and
 * the server picks and frames the images (a photo edit of the target, or her references alone).
 */
/** Generate controls, shown only when image generation is on for the account (own Image key + turned on in Settings). */
export function GenerateImage(props: GenerateImageProps) {
  return useGeneration() ? <GenerateImageInner {...props} /> : null;
}

type GenerateImageProps = Parameters<typeof GenerateImageInner>[0];

function GenerateImageInner({
  prompt,
  characterId,
  extraPaths,
  kind,
  freeImagesLeft = null,
  aspectRatio: lockedAspectRatio,
  defaultResolution = "1k",
  actionLabel = "Generate image",
  renderActions,
  runSignal = 0,
  meta,
  autoAspectRatio,
  autoStart = false,
  compareTo,
  checkLikeness = true,
  historyId,
}: {
  prompt: string;
  characterId?: string | null;
  extraPaths: string[];
  kind: "inject" | "direct_swap" | "edit" | "variant" | "carousel" | "face_fix" | "likeness_fix" | "reference_sheet" | "group_photo" | "art_to_real";
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
  /** Each time this goes up, the image is generated as if the button were pressed (used by "Generate all"). */
  runSignal?: number;
  /** Inject: what the server needs to frame the prompt for the image model. */
  meta?: InjectMeta;
  /** The shape to start on (the ratio closest to the target photo). */
  autoAspectRatio?: ImageAspectRatio;
  /** Start as soon as it appears (a fix the person just asked for). */
  autoStart?: boolean;
  /** For a fix: the image it fixes, so the likeness check says whether the fix got closer to her. */
  compareTo?: ImageRef;
  /** false for images that don't show her fully (a carousel detail or flat lay), so no likeness check runs. */
  checkLikeness?: boolean;
  /** The History prompt this runs, so History can open the image from it. */
  historyId?: string | null;
}) {
  const router = useRouter();
  const free = freeImagesLeft !== null;
  const { billing = "credits" } = useApp();
  const [resolution, setResolution] = useState<ImageResolution>(defaultResolution);
  const [chosenAspectRatio, setAspectRatio] = useState<ImageAspectRatio>(autoAspectRatio ?? DEFAULT_ASPECT_RATIO);
  const aspectRatio = lockedAspectRatio ?? chosenAspectRatio;
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("jpeg");
  // The size, shape and format last chosen anywhere on the site come back on every card, so images are made the same
  // way without choosing again. A sheet (fixed shape) keeps its own. Read after mounting, so the server render matches.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const apply = () => {
      const last = lockedAspectRatio ? null : readLastSettings();
      if (!last) return;
      if (last.resolution && (IMAGE_RESOLUTIONS as readonly string[]).includes(last.resolution)) setResolution(last.resolution);
      if (last.aspectRatio && (IMAGE_ASPECT_RATIOS as readonly string[]).includes(last.aspectRatio)) setAspectRatio(last.aspectRatio);
      if (last.outputFormat === "jpeg" || last.outputFormat === "png") setOutputFormat(last.outputFormat);
    };
    apply();
    setLoaded(true);
    // A choice made on another card (or in another tab) applies to this one too.
    const onStorage = (e: StorageEvent) => e.key === LAST_SETTINGS_KEY && apply();
    window.addEventListener(SETTINGS_EVENT, apply);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, apply);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // The page's one-off model, when its box has one.
  const pageModel = usePageModelForRequest();
  const request = {
    kind,
    characterId: characterId ?? null,
    extraPaths,
    prompt,
    resolution: free ? "1k" : resolution,
    aspectRatio,
    outputFormat,
    ...(meta ? { meta } : {}),
    ...(historyId ? { historyId } : {}),
    ...(pageModel ? { model: pageModel } : {}),
  };
  // Something to send: pictures, or (for a framed Inject prompt) a character whose references the server picks.
  const hasImages = extraPaths.length > 0 || (!!meta && (!!characterId || !!meta.target || (meta.group?.length ?? 0) >= 2));
  const requestKey = JSON.stringify(request);

  // Show the price before anything is spent, on their own key only (tokens have a set price per size, shown on the
  // button, so there is nothing to look up). A failed lookup just hides it.
  useEffect(() => {
    setPrice(null);
    if (free || billing === "credits" || !prompt.trim() || !hasImages) return;
    const t = setTimeout(async () => {
      const q = await quoteImageGeneration(JSON.parse(requestKey));
      if (alive.current && q.ok) setPrice(q.estimatedCost);
    }, 400);
    return () => clearTimeout(t);
  }, [requestKey, free, billing, prompt, hasImages]);

  async function generate() {
    setPhase("starting");
    setMessage(undefined);
    setResult(null);
    // Every press shows up in the tray at the bottom of the page.
    const tray = { key: crypto.randomUUID(), label: featureLabel(`image:${kind}`), prompt };
    reportGeneration({ ...tray, state: "generating" });
    // If the answer is lost (Safari in the background), find the job by this press's id instead of hanging.
    const clientRef = crypto.randomUUID();
    const started = await awaitOrRecover(startImageGeneration({ ...request, clientRef }), async () => {
      const r = await findGenerationByRef(clientRef);
      return r.generationId ? { ok: true as const, generationId: r.generationId, free: false } : null;
    }, { firstCheckMs: 20_000, timeoutMs: 2 * 60_000 }).catch((e: unknown): AiFailure => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't start the image. Try again." }));
    if (!started.ok) {
      reportGeneration({ ...tray, state: "failed", error: tokenGate(started.error) });
      if (started.reason) reportModelRefused({ reason: started.reason, model: pageModel ?? null });
      if (started.redirectTo) return router.push(started.redirectTo);
      setPhase("failed");
      return setMessage(started.error);
    }
    // Started: its tokens are spent, so the header's count updates.
    reportGeneration({ ...tray, state: "generating", generationId: started.generationId });
    // Remembered for this tab, so a page the phone reloads (after switching apps) still shows the image.
    rememberGeneration({ generationId: started.generationId, key: tray.key, request: requestHash(requestKey), path: location.pathname, label: tray.label, prompt, startedAt: Date.now() });
    await follow(started.generationId, tray);
  }

  /**
   * Checks the job until it finishes. A check that fails (the phone was asleep, the network dropped) is tried again,
   * and coming back to the tab or app checks at once. If this panel goes away, the tray keeps checking.
   */
  async function follow(generationId: string, tray: { key: string; label: string; prompt: string }) {
    const handOff = () => reportGeneration({ ...tray, state: "generating", generationId, detached: true });
    if (!alive.current) return handOff();
    setPhase("running");
    const deadline = Date.now() + MAX_POLLS * POLL_MS;
    let errors = 0;
    while (Date.now() < deadline) {
      await waitOrWake(POLL_MS);
      if (!alive.current) return handOff();
      let status: Awaited<ReturnType<typeof checkImageGeneration>>;
      try {
        status = await checkGeneration(generationId);
      } catch {
        continue; // Couldn't reach the server (asleep or offline): try again.
      }
      if (!status.ok) {
        // A real answer saying it can't be checked; give it a few tries in case it was a blip.
        if (++errors < 3) continue;
        forgetGeneration(generationId);
        reportGeneration({ ...tray, state: "failed", error: status.error });
        setPhase("failed");
        return setMessage(status.error);
      }
      errors = 0;
      if (status.state === "complete") {
        reportGeneration({ ...tray, state: "ready", url: status.url, downloadUrl: status.downloadUrl });
        setResult({ generationId, url: status.url, downloadUrl: status.downloadUrl });
        setPhase("done");
        router.refresh();
        return;
      }
      if (status.state === "failed") {
        forgetGeneration(generationId);
        reportGeneration({ ...tray, state: "failed", error: status.error });
        setPhase("failed");
        return setMessage(status.error);
      }
    }
    handOff();
    setPhase("failed");
    setMessage("Still working on it. It will show up in the tray below and in History, under Images, when it's ready.");
  }

  // The page was reloaded (or this panel shown again) while a job it started was running or had just finished: pick
  // it back up and show the image.
  const resumed = useRef(false);
  useEffect(() => {
    // Waits for the remembered settings, so the request matches the one that was started.
    if (resumed.current || !loaded) return;
    resumed.current = true;
    const p = latestForRequest(requestHash(requestKey));
    if (!p) return;
    const tray = { key: p.key, label: p.label, prompt: p.prompt };
    reportGeneration({ ...tray, state: "generating", generationId: p.generationId });
    void follow(p.generationId, tray);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const busy = phase === "starting" || phase === "running";
  const ready = !!prompt.trim() && hasImages;

  // "Generate all": start when the signal goes up, unless this one is already running or done.
  const lastSignal = useRef(runSignal);
  useEffect(() => {
    if (runSignal === lastSignal.current) return;
    lastSignal.current = runSignal;
    if (!busy && phase !== "done" && ready) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);
  // A fix starts straight away: the person already chose it.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current || !ready || !loaded) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, ready, loaded]);
  // Tokens have a set price per size; an own key (Pro) shows the provider's quote instead.
  // On the pink button the token is drawn in the page's background colour, so it reads as a cut-out.
  const cost =
    billing === "credits" ? <TokenCost n={IMAGE_CREDITS[resolution]} onPink /> : price ? ` · about $${Number(price).toFixed(3)}` : "";
  const label = free ? `Generate my free image (${freeImagesLeft} left)` : <>{result ? "Regenerate" : actionLabel}{cost}</>;

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-800 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-neutral-400">
          Size
          <select className={select} value={free ? "1k" : resolution} disabled={free || busy} onChange={(e) => {
            const v = e.target.value as ImageResolution;
            setResolution(v);
            if (!lockedAspectRatio) writeLastSettings({ resolution: v });
          }}>
            {IMAGE_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {!lockedAspectRatio && (
          <label className="flex items-center gap-1.5 text-neutral-400">
            Shape
            <select className={select} value={chosenAspectRatio} disabled={busy} onChange={(e) => {
              const v = e.target.value as ImageAspectRatio;
              setAspectRatio(v);
              writeLastSettings({ aspectRatio: v });
            }}>
              {IMAGE_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-neutral-400">
          Format
          <select className={select} value={outputFormat} disabled={busy} onChange={(e) => {
            const v = e.target.value as ImageOutputFormat;
            setOutputFormat(v);
            if (!lockedAspectRatio) writeLastSettings({ outputFormat: v });
          }}>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </label>
      </div>
      {free && <p className="text-xs text-neutral-500">Your free image is made at 1k, and you can only make one.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" className="max-sm:h-11 max-sm:w-full max-sm:text-[15px]" onClick={generate} disabled={busy || !ready}>
          {busy && <Spinner className="h-3.5 w-3.5" />}
          {phase === "starting" ? "Starting..." : phase === "running" ? "Generating..." : label}
        </Button>
        {phase === "running" && <p className="text-xs text-neutral-500">This typically takes ~120 seconds. Once started, it can't be cancelled.</p>}
        {message && <p role="alert" className="text-sm text-red-400">{message}</p>}
        {busy && <div className="progress-indeterminate w-full basis-full" aria-hidden="true" />}
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => viewImage({ url: result.url, downloadUrl: result.downloadUrl, prompt, title: featureLabel(`image:${kind}`), generated: true, generationId: result.generationId })}
            className="self-start rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            aria-label="View full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt="Generated" className="thumb max-h-96 w-auto max-w-full animate-pop-in cursor-zoom-in ring-1 ring-white/10 shadow-[0_20px_50px_-25px_rgb(0_0_0/0.9)]" />
          </button>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a href={result.downloadUrl} className="font-semibold text-brand-400 underline-offset-4 transition-colors hover:text-brand-300 hover:underline">Download</a>
            <button type="button" onClick={() => openHistory("images")} className="text-neutral-400 underline-offset-4 transition-colors hover:text-neutral-100 hover:underline">All images</button>
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              Kept for {GENERATION_RETENTION_HOURS} hours
              <InfoTip label="About expiry">Generated images are deleted {GENERATION_RETENTION_HOURS} hours after they are created. Download any you want to keep.</InfoTip>
            </span>
          </div>
          {renderActions?.(result)}
          {/* Any generated image of a character can be pinned to her reference photos (sheets have their own Save). */}
          {characterId && kind !== "reference_sheet" && <PinToReferences generationId={result.generationId} characterId={characterId} />}
          {/* A "Check likeness" button under every generated image of a character; it runs only when pressed (it spends their key). */}
          {!free && checkLikeness && characterId && kind !== "reference_sheet" && (
            <LikenessPanel characterId={characterId} image={{ generationId: result.generationId }} original={compareTo} frame={meta?.frame} />
          )}
        </div>
      )}
    </div>
  );
}

interface LastSettings {
  resolution?: ImageResolution;
  aspectRatio?: ImageAspectRatio;
  outputFormat?: ImageOutputFormat;
}
/** The shape a card starts on when nothing was chosen before (and the target photo gives none). */
const DEFAULT_ASPECT_RATIO: ImageAspectRatio = "2:3";
/** The size, shape and format last chosen, for every page, kept in this browser. */
const LAST_SETTINGS_KEY = "ms.genSettings";
const SETTINGS_EVENT = "modelspawn:gen-settings";
function readLastSettings(): LastSettings | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_SETTINGS_KEY) || "null");
  } catch {
    return null;
  }
}
function writeLastSettings(v: LastSettings) {
  try {
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify({ ...readLastSettings(), ...v }));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  } catch {
    // Private windows can refuse storage; each card then starts on the defaults.
  }
}
