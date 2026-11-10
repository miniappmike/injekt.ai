"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LockIcon, SparkIcon } from "@/components/icons";
import { Coverflow, type CoverflowApi } from "@/components/marketplace/coverflow";
import { MarketCard } from "@/components/marketplace/market-card";
import { MarketGrid } from "@/components/marketplace/market-grid";
import { SortControl, TabPills, ViewToggle } from "@/components/marketplace/market-controls";
import { MarketProgress } from "@/components/marketplace/market-progress";
import { marketQuery, sortListings, type ListingStat, type MarketCounts, type PublicListing, type SortKey, type ViewMode } from "@/lib/marketplace/view";

type Tab = "available" | "sold";

/**
 * The browse screen: title, live progress, Available/Sold tabs, a row of round "story" bubbles and the coverflow.
 * It takes plain props (the route loads the data), so it renders anywhere.
 */
export function MarketBrowser({
  listings,
  counts,
  likes,
  stats = {},
  isAdmin,
  initialTab = "available",
  initialSort = "trending",
  initialView = "cards",
}: {
  listings: PublicListing[];
  counts: MarketCounts;
  likes: Record<string, { likes: number; liked: boolean }>;
  /** Views, likes and Virality Rank per persona (used for sorting and the grid badges). */
  stats?: Record<string, ListingStat>;
  isAdmin: boolean;
  initialTab?: Tab;
  initialSort?: SortKey;
  initialView?: ViewMode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [view, setView] = useState<ViewMode>(initialView);
  const [active, setActive] = useState(0);
  const api = useRef<CoverflowApi>(null);
  // Sorting only changes the order; every persona on the tab is still shown.
  const shown = useMemo(() => sortListings(listings.filter((l) => l.state === tab), stats, sort), [listings, stats, tab, sort]);
  const nAvailable = listings.filter((l) => l.state === "available").length;
  const nSold = listings.length - nAvailable;

  // Remember the tab, sort and view in the address, so a refresh or Back from a persona page returns here. No navigation needed.
  function remember(next: { tab: Tab; sort: SortKey; view: ViewMode }) {
    try {
      history.replaceState(null, "", `/marketplace${marketQuery(next)}`);
    } catch {
      // not important
    }
  }
  function pick(next: Tab) {
    setTab(next);
    setActive(0);
    remember({ tab: next, sort, view });
  }
  function pickSort(next: SortKey) {
    setSort(next);
    setActive(0);
    remember({ tab, sort: next, view });
  }
  function pickView(next: ViewMode) {
    setView(next);
    remember({ tab, sort, view: next });
  }

  const onActive = useCallback((i: number) => setActive(i), []);
  const edge = (i: number) => (dir: -1 | 1) => api.current?.scrollToIndex(i + dir);
  // Persona links remember where you came from, so the back arrow returns to the same tab, sort and view.
  const hrefFor = (l: PublicListing) => `/marketplace/${l.id}${marketQuery({ tab, sort, view }) || ""}`;

  return (
    <div>
      <header className="mx-auto flex max-w-2xl lg:max-w-3xl flex-col items-center text-center max-sm:w-full">
        <MarketProgress initial={counts} avatars={listings.filter((l) => l.state === "available" && l.images[0]).slice(0, 4).map((l) => l.images[0].url)} />
        <h1 className="mt-4 hidden font-poster text-[clamp(2.5rem,5vw,4rem)] leading-none tracking-wide text-neutral-50 uppercase sm:block">Marketplace</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400 [text-wrap:balance] sm:mt-2.5 sm:text-[15px]">
          One-of-a-kind fictional personas, each sold to exactly one owner.
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
        <TabPills
          tabs={[
            { key: "available", label: "Available", count: nAvailable },
            { key: "sold", label: "Sold", count: nSold },
          ]}
          value={tab}
          onChange={pick}
        />
        <div className="flex items-center gap-3">
          <SortControl value={sort} onChange={pickSort} />
          <ViewToggle value={view} onChange={pickView} />
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
        view === "grid" ? (
          <div className="mt-6">
            <p className="mb-3 font-mono text-xs tracking-[0.18em] text-neutral-400 uppercase">
              {tab === "available" ? `${shown.length} ${shown.length === 1 ? "persona" : "personas"} available` : `${shown.length} sold`}
            </p>
            <MarketGrid key={`${tab}-${sort}`} listings={shown} likes={likes} stats={stats} isAdmin={isAdmin} hrefFor={hrefFor} />
          </div>
        ) : (
        <>
          {/* Story bubbles: one round photo per persona. Tap to jump to her card. */}
          <ul
            key={`stories-${tab}`}
            aria-label="Jump to a persona"
            className="no-scrollbar -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 py-1 sm:mt-5 sm:-mx-6 sm:gap-4 sm:px-6 [&>:first-child]:ml-auto [&>:last-child]:mr-auto"
          >
            {shown.map((l, i) => (
              <li key={l.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => api.current?.scrollToIndex(i)}
                  aria-label={`Show ${l.name}`}
                  aria-current={i === active ? "true" : undefined}
                  className="group flex w-[4rem] flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  <span className={cn("relative rounded-full p-[3px] transition-all duration-300", i === active ? "bg-gradient-to-tr from-brand-500 via-brand-300 to-iris-400 scale-105" : "bg-neutral-700 group-hover:bg-neutral-500")}>
                    <span className="block h-[3.25rem] w-[3.25rem] overflow-hidden rounded-full border-2 border-neutral-950 bg-neutral-800">
                      {l.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed storage link
                        <img src={l.images[0].url} alt="" loading="lazy" draggable={false} className={cn("h-full w-full object-cover", l.state === "sold" && "saturate-50")} />
                      )}
                    </span>
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-full border-2 border-neutral-950 bg-neutral-100 text-neutral-900">
                      {l.state === "sold" ? <LockIcon className="h-2.5 w-2.5" /> : <SparkIcon className="h-2.5 w-2.5" />}
                    </span>
                  </span>
                  <span className={cn("w-full truncate text-center text-[11px] font-medium", i === active ? "text-neutral-50" : "text-neutral-400")}>{l.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <Coverflow
            key={`${tab}-${sort}`}
            api={api}
            onActive={onActive}
            label={tab === "available" ? "Available personas" : "Sold personas"}
            count={shown.length}
            render={(i, primary) => (
              <MarketCard listing={shown[i]} likes={likes[shown[i].id] ?? { likes: 0, liked: false }} isAdmin={isAdmin} onEdge={edge(i)} index={i} href={hrefFor(shown[i])} primary={primary} />
            )}
          />
        </>
        )
      )}
    </div>
  );
}
