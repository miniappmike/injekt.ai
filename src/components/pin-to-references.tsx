"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPinnedPath, pinToReferences, unpinFromReferences } from "@/app/(app)/characters/pin-actions";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

// What each image's Pin It is doing lives outside the component, so stepping to another image with the arrow keys while
// the nudity check runs doesn't lose it: the check carries on, and its result is there when you come back.
type PinState = { busy?: boolean; done?: string; error?: string; path?: string };
const pinStates = new Map<string, PinState>();
// Images already looked up for an earlier pin, so each is asked about once per page load.
const looked = new Set<string>();
const pinListeners = new Set<() => void>();
function setPinState(id: string, s: PinState) {
  pinStates.set(id, s);
  pinListeners.forEach((l) => l());
}
function usePinState(id: string): PinState {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    pinListeners.add(l);
    return () => void pinListeners.delete(l);
  }, []);
  return pinStates.get(id) ?? {};
}

/**
 * "Pin It" under a generated image of a character. At the limit, a pop-up asks before the new image
 * replaces the next of her reference photos in rotation (1st, 2nd, ... then back to the 1st), and it only goes ahead once the box is ticked.
 */
export function PinToReferences({
  generationId,
  characterId,
  className,
  buttonClassName,
}: {
  generationId: string;
  characterId: string;
  /** Extra classes for the wrapper and for the button itself (the viewer sizes them for phones). */
  className?: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const state = usePinState(generationId);
  const setState = (s: PinState) => setPinState(generationId, s);
  // An image pinned earlier (this visit or before): find its copy so it shows as pinned, with Unpin.
  useEffect(() => {
    if (pinStates.has(generationId) || looked.has(generationId)) return;
    looked.add(generationId);
    void getPinnedPath(generationId, characterId).then((r) => {
      if (r && !pinStates.has(generationId)) setPinState(generationId, { path: r.path, done: `Pinned to her reference photos (${r.count} of ${MAX_REFERENCE_PHOTOS}).` });
    });
  }, [generationId, characterId]);
  const [confirm, setConfirm] = useState<number | false>(false);
  const [agreed, setAgreed] = useState(false);

  async function pin(replaceLast = false) {
    setState({ busy: true });
    const r = await pinToReferences({ generationId, characterId, replaceLast });
    if (r.ok) {
      setConfirm(false);
      setState({ path: r.path, done: r.replaced ? `Pinned. It replaced her reference photo ${r.slot}.` : `Pinned to her reference photos (${r.count} of ${MAX_REFERENCE_PHOTOS}).` });
      router.refresh();
    } else if ("full" in r) {
      setAgreed(false);
      setConfirm(r.slot);
      setState({});
    } else if (r.redirectTo) {
      router.push(r.redirectTo);
    } else {
      setState({ error: r.error });
    }
  }

  async function unpin() {
    if (!state.path) return;
    const path = state.path;
    setState({ ...state, busy: true, error: undefined });
    const r = await unpinFromReferences({ characterId, path });
    if (r.ok) {
      looked.add(generationId);
      setState({});
      router.refresh();
    } else if ("redirectTo" in r && r.redirectTo) {
      router.push(r.redirectTo);
    } else {
      setState({ ...state, error: "error" in r ? r.error : "Couldn't unpin it." });
    }
  }

  return (
    <div className={`flex flex-col gap-2 text-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" className={buttonClassName} disabled={state.busy || !!state.done} onClick={() => void pin()}>
          {state.busy ? "Checking…" : state.done ? "Pinned" : "Pin It"}
        </Button>
        {state.done && state.path && (
          <Button type="button" size="sm" variant="secondary" className={buttonClassName} disabled={state.busy} onClick={() => void unpin()}>
            {state.busy ? "Unpinning…" : "Unpin"}
          </Button>
        )}
        {state.done && <span role="status" className="text-emerald-300">{state.done}</span>}
        {state.error && <span role="alert" className="text-red-400">{state.error}</span>}
      </div>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]" onClick={() => !state.busy && setConfirm(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-full-title"
            className="panel flex w-full max-w-md animate-pop-in flex-col gap-3 p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && !state.busy && setConfirm(false)}
          >
            <p id="pin-full-title" className="font-display text-lg font-bold text-neutral-50">She already has {MAX_REFERENCE_PHOTOS} reference photos</p>
            <p className="text-neutral-300">You are about to replace her reference photo {confirm} of {MAX_REFERENCE_PHOTOS} with this image. Each new pin replaces the next photo in turn, so you can cycle through all of them.</p>
            <label className="flex items-start gap-2 text-neutral-200">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} autoFocus />
              Replace reference photo {confirm} with this one
            </label>
            {state.error && <p role="alert" className="text-red-400">{state.error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={state.busy} onClick={() => setConfirm(false)}>Cancel</Button>
              <Button type="button" disabled={!agreed || state.busy} onClick={() => void pin(true)}>
                {state.busy ? "Replacing…" : "Replace and pin"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
