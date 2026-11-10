"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { segItem, segTrack } from "@/components/ui/segmented";
import { LockIcon, SparkIcon } from "@/components/icons";
import { Coverflow, type CoverflowApi } from "@/components/marketplace/coverflow";
import { MarketCard } from "@/components/marketplace/market-card";
import { MarketProgress } from "@/components/marketplace/market-progress";
import type { MarketCounts, PublicListing } from "@/lib/marketplace/view";

type Tab = "available" | "sold";

/**
 * The browse screen: title, live progress, Available/Sold tabs, a row of round "story" bubbles and the coverflow.
 * It takes plain props (the route loads the data), so it renders anywhere.
 */
export function MarketBrowser({
  listings,
  counts,
  likes,
  isAdmin,
  initialTab = "available",
}: {
  listings: PublicListing[];
  counts: MarketCounts;
  likes: Record<string, { likes: number; liked: boolean }>;
  isAdmin: boolean;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [active, setActive] = useState(0);
  const api = useRef<CoverflowApi>(null);
  const shown = listings.filter((l) => l.state === tab);
  const nAvailable = listings.filter((l) => l.state === "available").length;
  const nSold = listings.length - nAvailable;

  function pick(next: Tab) {
    setTab(next);
    setActive(0);
    // Remember the tab in the address, so Back from a persona page returns here. No navigation needed.
    try {
      history.replaceState(null, "", next === "available" ? "/marketplace" : `/marketplace?tab=${next}`);
    } catch {
      // not important
    }
  }

  const onActive = useCallback((i: number) => setActive(i), []);
  const edge = (i: number) => (dir: -1 | 1) => api.current?.scrollToIndex(i + dir);

  return (
    <div>
      <div className="sm:flex sm:items-end sm:justify-between sm:gap-8">
        <div>
          <h1 className="page-title">Marketplace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
            One-of-a-kind fictional personas, each sold to one owner. You get her sheets and profile.
          </p>
        </div>
        <MarketProgress initial={counts} />
      </div>

      <div className="mt-5 sm:mt-4 sm:flex sm:justify-center">
        <div role="tablist" aria-label="Marketplace" className={cn(segTrack, "max-sm:w-full sm:min-w-72")}>
          {(["available", "sold"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => pick(t)} className={cn(segItem(tab === t), "sm:flex-1")}>
              {t === "available" ? `Available (${nAvailable})` : `Sold (${nSold})`}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="panel animate-fade-up mx-auto mt-8 max-w-md p-8 text-center">
          <p className="font-display text-lg font-semibold text-neutral-100">{tab === "available" ? "The shelf is empty right now" : "Nothing sold yet"}</p>
          <p className="mt-1.5 text-sm text-neutral-400">
            {tab === "available" ? "New personas are added from time to time. Check back soon." : "When a persona finds her owner she moves here."}
          </p>
        </div>
      ) : (
        <>
          {/* Story bubbles: one round photo per persona. Tap to jump to her card. */}
          <ul
            key={`stories-${tab}`}
            aria-label="Jump to a persona"
            className="no-scrollbar -mx-4 mt-5 flex gap-4 overflow-x-auto px-4 py-1 sm:mt-3 sm:-mx-6 sm:px-6 [&>:first-child]:ml-auto [&>:last-child]:mr-auto"
          >
            {shown.map((l, i) => (
              <li key={l.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => api.current?.scrollToIndex(i)}
                  aria-label={`Show ${l.name}`}
                  aria-current={i === active ? "true" : undefined}
                  className="group flex w-[4.4rem] flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  <span className={cn("relative rounded-full p-[3px] transition-all duration-300", i === active ? "bg-gradient-to-tr from-brand-500 via-brand-300 to-iris-400 scale-105" : "bg-neutral-700 group-hover:bg-neutral-500")}>
                    <span className="block h-[3.7rem] w-[3.7rem] overflow-hidden rounded-full border-2 border-neutral-950 bg-neutral-800">
                      {l.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed storage link
                        <img src={l.images[0].url} alt="" loading="lazy" draggable={false} className={cn("h-full w-full object-cover", l.state === "sold" && "saturate-50")} />
                      )}
                    </span>
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-neutral-950 bg-neutral-100 text-neutral-900">
                      {l.state === "sold" ? <LockIcon className="h-3 w-3" /> : <SparkIcon className="h-3 w-3" />}
                    </span>
                  </span>
                  <span className={cn("w-full truncate text-center text-[11px] font-medium", i === active ? "text-neutral-50" : "text-neutral-400")}>{l.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <Coverflow key={tab} api={api} onActive={onActive} label={tab === "available" ? "Available personas" : "Sold personas"}>
            {shown.map((l, i) => (
              <MarketCard key={l.id} listing={l} likes={likes[l.id] ?? { likes: 0, liked: false }} tab={tab} isAdmin={isAdmin} onEdge={edge(i)} index={i} />
            ))}
          </Coverflow>
        </>
      )}
    </div>
  );
}
