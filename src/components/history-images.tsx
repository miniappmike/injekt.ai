"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExpiryBadge } from "@/components/expiry-badge";
import { RetentionNotice } from "@/components/retention-notice";
import { formatUsd } from "@/lib/pricing";
import { viewImage } from "@/lib/panel-events";
import type { GenerationItem } from "@/lib/history-types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const PLACEHOLDER: Record<GenerationItem["state"], string> = {
  generating: "Generating...",
  ready: "",
  expired: "Expired",
  failed: "Failed",
};

function costLine(i: GenerationItem) {
  if (i.state === "generating") return null;
  if (i.free) return "Covered by Model Spawn";
  return i.costUsd === null ? null : `Cost ${formatUsd(i.costUsd)}`;
}

// The Images tab: everything you generated, newest first, with how long each one is kept.
export function HistoryImages({
  images,
  error,
  onCopy,
  onNavigate,
}: {
  images: GenerationItem[] | null;
  error: boolean;
  onCopy: (prompt: string) => void;
  /** Called when a link inside the list takes you to another page, so the panel can get out of the way. */
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RetentionNotice />
      {error && <p role="alert" className="text-sm text-red-400">Couldn&apos;t load your images. Close and reopen to try again.</p>}
      {!error && images === null && <p className="text-sm text-neutral-400">Loading...</p>}
      {images && !images.length && (
        <p className="text-sm text-neutral-400">No images yet. Anything you generate will show up here.</p>
      )}
      <ul className="flex flex-col gap-3">
        {images?.map((i) => {
          const cost = costLine(i);
          return (
            <li key={i.id} className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              {i.previewUrl ? (
                <button
                  type="button"
                  onClick={() => viewImage({ url: i.previewUrl as string, downloadUrl: i.downloadUrl, prompt: i.prompt, title: i.kindLabel })}
                  aria-label={`View ${i.kindLabel} image`}
                  className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.previewUrl} alt="" className="h-20 w-20 cursor-zoom-in rounded-md object-cover" />
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-neutral-800 px-1 text-center text-xs text-neutral-500">
                  {PLACEHOLDER[i.state]}
                </div>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{i.kindLabel}{i.model ? ` · ${i.model}` : ""}</p>
                <p className="text-xs text-neutral-500">{when(i.createdAt)}</p>
                {(i.state === "ready" || i.state === "expired") && (
                  <div className="mt-1"><ExpiryBadge expiresAt={i.expiresAt} /></div>
                )}
                {i.prompt && <p className="mt-1 line-clamp-2 text-neutral-400">{i.prompt}</p>}
                {i.error && <p className="mt-1 text-red-400">{i.error}</p>}
                {cost && (
                  <p className="mt-1 text-xs text-neutral-500">
                    {cost}
                    {" · "}
                    <Link href="/ledger" onClick={onNavigate} className="underline">Ledger</Link>
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {i.downloadUrl && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={i.downloadUrl}>Download</a>
                    </Button>
                  )}
                  {i.prompt && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => onCopy(i.prompt as string)}>Copy prompt</Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
