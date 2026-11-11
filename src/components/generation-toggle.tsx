"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GET_KEY_PATH } from "@/lib/links";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setGeneration } from "@/app/(app)/settings/api-keys/actions";

type Step = "idle" | "explain" | "confirm";

/**
 * The switch for generating images on the site. Shown once an Image key is saved; turning it on takes two steps (what
 * it means, then a tick-box), so nobody starts paying for images by accident. Turning it off is one click.
 */
export function GenerationToggle({ hasImageKey, enabled }: { hasImageKey: boolean; enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save(on: boolean) {
    setBusy(true);
    setError(undefined);
    const r = await setGeneration({ enabled: on, confirmed: on ? agreed : undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStep("idle");
    setAgreed(false);
    router.refresh();
  }

  return (
    <section id="image-generation" className="panel flex scroll-mt-28 flex-col gap-3 p-5" aria-labelledby="gen-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gen-title" className="font-display text-lg font-bold text-neutral-50">Image generation</h2>
          <p className="text-sm text-neutral-400">
            {enabled ? "On. Generate buttons show next to your prompts and use your own Image key." : "Off. Every tool writes prompts for you to paste into your generator."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40" : "bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>

      {!hasImageKey ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-400">
          Want to make images right here instead of copying prompts? Add your own <b className="text-neutral-200">Image</b> key above, and a switch to turn it on appears here.{" "}
          <Link href={GET_KEY_PATH} className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Get an API key →</Link>
        </p>
      ) : enabled ? (
        <div>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => save(false)}>
            {busy ? "Turning off..." : "Turn off image generation"}
          </Button>
        </div>
      ) : step === "idle" ? (
        <div>
          <Button type="button" size="sm" onClick={() => setStep("explain")}>Enable image generation</Button>
        </div>
      ) : step === "explain" ? (
        <div role="dialog" aria-labelledby="gen-explain" className="animate-pop-in rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p id="gen-explain" className="font-semibold text-amber-200">Before you turn it on (step 1 of 2)</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-neutral-300">
            <li>Each image is made with <b>your own Image key</b>, so your provider charges you for it. The price shows on every button before you press it.</li>
            <li>Images are kept for 72 hours, then deleted. Download the ones you want.</li>
            <li>You can still copy prompts anytime, and turn this off whenever you like.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => setStep("confirm")}>Continue</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep("idle")}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div role="dialog" aria-labelledby="gen-confirm" className="animate-pop-in rounded-xl border border-brand-500/40 bg-brand-500/5 p-4 text-sm">
          <p id="gen-confirm" className="font-semibold text-neutral-50">Confirm (step 2 of 2)</p>
          <label className="mt-2 flex items-start gap-2 text-neutral-300">
            <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            I understand every image I generate is charged to my own key by my provider.
          </label>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" disabled={!agreed || busy} onClick={() => save(true)}>
              {busy ? "Turning on..." : "Turn on image generation"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setStep("idle"); setAgreed(false); }}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
