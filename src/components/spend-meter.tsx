"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSpend } from "@/app/(app)/spend/actions";
import { formatUsd } from "@/lib/pricing";
import { SPEND_EVENT } from "@/lib/spend-events";
import type { JobSpend, SpendOverview } from "@/lib/spend";

const tz = () => new Date().getTimezoneOffset();
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function JobRow({ job }: { job: JobSpend }) {
  const isText = job.id !== "image";
  return (
    <li className="rounded-md border border-neutral-800 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{job.label}</span>
        <span className="text-xs text-neutral-400">
          {formatUsd(job.today)} today · {formatUsd(job.month)} this month
        </span>
      </div>
      {job.setup ? (
        <p className="mt-0.5 break-words text-xs text-neutral-500">
          {job.setup.provider} · {job.setup.model}
          {job.setup.usesKeyOf ? ` (uses the ${job.setup.usesKeyOf} key)` : ""}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-neutral-500">
          Not set up. <Link href="/settings/api-keys" className="underline">Add a key</Link>
        </p>
      )}
      {job.calls > 0 && (
        <p className="mt-1 text-xs text-neutral-500">
          {job.calls} call{job.calls === 1 ? "" : "s"} this month
          {isText && job.inputTokens + job.outputTokens > 0 ? ` · ${tokens(job.inputTokens)} in, ${tokens(job.outputTokens)} out` : ""}
        </p>
      )}
      {isText && job.setup && (
        <p className="mt-1 text-xs text-neutral-500">
          {job.price ? (
            <>
              ${job.price.input} in / ${job.price.output} out per million tokens ({job.price.source === "you" ? "your price" : "list price"})
            </>
          ) : (
            <>
              No price known for this model, so dollars can&apos;t be shown. <Link href="/settings/api-keys" className="underline">Enter it</Link>
            </>
          )}
        </p>
      )}
      {job.unpricedCalls > 0 && (
        <p className="mt-1 text-xs text-amber-400">
          {job.unpricedCalls} call{job.unpricedCalls === 1 ? "" : "s"} couldn&apos;t be priced, so the total above is a little low.
        </p>
      )}
    </li>
  );
}

// A live total in the header, and a panel with the breakdown per job and what each action typically costs.
export function SpendMeter() {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<SpendOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (details: boolean) => {
    const next = await getSpend({ tzOffsetMinutes: tz(), details });
    if (next) {
      setOverview(next);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  // Keep the header total current: on load, whenever something is spent, and every minute while the tab is visible.
  useEffect(() => {
    void refresh(false);
    const onSpend = () => void refresh(open);
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(open), 60_000);
    window.addEventListener(SPEND_EVENT, onSpend);
    return () => {
      clearInterval(timer);
      window.removeEventListener(SPEND_EVENT, onSpend);
    };
  }, [refresh, open]);

  useEffect(() => {
    if (!open) return;
    void refresh(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, refresh]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="spend-panel"
        className="rounded-md border border-neutral-800 px-2 py-1 text-sm text-neutral-300 hover:text-neutral-100"
      >
        {overview ? `${formatUsd(overview.today)} today` : "Spend"}
      </button>

      {open && (
        <div
          id="spend-panel"
          role="dialog"
          aria-label="Spend"
          className="absolute right-0 top-full z-30 mt-2 max-h-[80vh] w-[min(26rem,92vw)] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-xl"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Your spend</h2>
            {overview && (
              <span className="text-sm text-neutral-300">
                {formatUsd(overview.today)} today · {formatUsd(overview.month)} this month
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">What you spend through Model Spawn on your own keys. Your provider&apos;s invoice is the final word.</p>

          {failed && <p role="alert" className="mt-3 text-sm text-red-400">Couldn&apos;t load your spend. Try again in a moment.</p>}
          {!overview && !failed && <p className="mt-3 text-sm text-neutral-400">Loading...</p>}

          {overview && (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {overview.jobs.map((job) => <JobRow key={job.id} job={job} />)}
              </ul>

              {overview.provider && (
                <div className="mt-3 rounded-md border border-neutral-800 p-3 text-sm">
                  <p className="font-medium">{overview.provider.name} account</p>
                  {overview.provider.balance && <p className="text-neutral-300">Balance left: {formatUsd(Number(overview.provider.balance))}</p>}
                  {overview.provider.imagePrices && overview.provider.imagePrices.length > 0 && (
                    <p className="text-xs text-neutral-500">
                      Image prices: {overview.provider.imagePrices.map((p) => `${p.label} ${formatUsd(Number(p.price))}`).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              <h3 className="mt-4 text-sm font-medium">What each action typically costs</h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {overview.typical.map((t) => (
                  <li key={t.feature} className="flex items-baseline justify-between gap-2">
                    <span className="text-neutral-300">{t.label}</span>
                    <span className="text-neutral-400">
                      {t.cost === null ? "unknown" : `${t.basis === "rough" ? "about " : ""}${formatUsd(t.cost)}`}
                      {t.basis === "history" ? <span className="text-xs text-neutral-500"> · {t.runs} run{t.runs === 1 ? "" : "s"}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-500">
                &ldquo;About&rdquo; means an estimate until you have runs of your own. Image prices are shown before each generation.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
