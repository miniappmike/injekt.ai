"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setGeneration } from "@/app/(app)/settings/api-keys/actions";
import { IMAGE_CREDITS } from "@/lib/plans";

/**
 * The switch for generating images on the site. On by default: images are paid with tokens (or on Pro with their own
 * Image key). Off, every tool only writes prompts to paste into a generator.
 */
export function GenerationToggle({ enabled, ownKey }: { enabled: boolean; ownKey: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save(on: boolean) {
    setBusy(true);
    setError(undefined);
    const r = await setGeneration({ enabled: on, confirmed: on });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const pays = ownKey ? "your own Image key (Pro)" : `credits: ${IMAGE_CREDITS["1k"]}, ${IMAGE_CREDITS["1.5k"]} or ${IMAGE_CREDITS["2k"]} per image at 1k, 1.5k or 2k`;
  return (
    <section id="image-generation" className="panel flex scroll-mt-28 flex-col gap-3 p-5" aria-labelledby="gen-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gen-title" className="font-display text-lg font-bold text-neutral-50">Image generation</h2>
          <p className="text-sm text-neutral-400">
            {enabled ? `On. Generate buttons show next to your prompts, paid with ${pays}.` : "Off. Every tool writes prompts for you to paste into your generator."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40" : "bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant={enabled ? "secondary" : "default"} disabled={busy} onClick={() => save(!enabled)}>
          {busy ? "Saving..." : enabled ? "Turn off image generation" : "Turn on image generation"}
        </Button>
        {!ownKey && (
          <Link href="/tokens" className="text-sm font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Buy tokens →</Link>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
