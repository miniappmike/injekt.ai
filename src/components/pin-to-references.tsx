"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pinToReferences } from "@/app/(app)/characters/pin-actions";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

/**
 * "Pin It" under a generated image of a character. At the limit, a pop-up asks before the new image
 * replaces the next of her reference photos in rotation (1st, 2nd, ... then back to the 1st), and it only goes ahead once the box is ticked.
 */
export function PinToReferences({ generationId, characterId }: { generationId: string; characterId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; done?: string; error?: string }>({});
  const [confirm, setConfirm] = useState<number | false>(false);
  const [agreed, setAgreed] = useState(false);

  async function pin(replaceLast = false) {
    setState({ busy: true });
    const r = await pinToReferences({ generationId, characterId, replaceLast });
    if (r.ok) {
      setConfirm(false);
      setState({ done: r.replaced ? `Pinned. It replaced her reference photo ${r.slot}.` : `Pinned to her reference photos (${r.count} of ${MAX_REFERENCE_PHOTOS}).` });
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

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={state.busy || !!state.done} onClick={() => void pin()}>
          {state.busy ? "Checking…" : state.done ? "Pinned" : "Pin It"}
        </Button>
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
