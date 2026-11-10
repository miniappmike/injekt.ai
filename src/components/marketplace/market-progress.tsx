"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { soldShare, type MarketCounts } from "@/lib/marketplace/view";

/**
 * "N available · M sold" with a bar showing the sold share. It re-asks the database whenever a listing changes
 * (Realtime) and every 30 seconds as a fallback, because Realtime may not reach signed-out visitors. When the numbers
 * really changed it also refreshes the page's lists, so a persona that just sold moves to the Sold tab.
 */
export function MarketProgress({ initial }: { initial: MarketCounts }) {
  const router = useRouter();
  const [counts, setCounts] = useState(initial);
  const latest = useRef(initial);

  // The server sent fresh numbers (after a refresh): show them.
  useEffect(() => {
    latest.current = initial;
    setCounts(initial);
  }, [initial.available, initial.sold]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(async () => {
    try {
      const { data, error } = await createBrowserSupabase().rpc("marketplace_counts");
      if (error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      const next = { available: Number(row.available), sold: Number(row.sold) };
      if (next.available === latest.current.available && next.sold === latest.current.sold) return;
      latest.current = next;
      setCounts(next);
      router.refresh();
    } catch {
      // Offline or blocked: keep showing the last numbers.
    }
  }, [router]);

  useEffect(() => {
    let channel: { unsubscribe?: () => unknown } | undefined;
    const supabase = createBrowserSupabase();
    try {
      channel = supabase
        .channel("marketplace-counts")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "marketplace_pulse" }, () => void refetch())
        .subscribe();
    } catch {
      // Realtime unavailable: the timer below still keeps the numbers fresh.
    }
    const timer = setInterval(() => void refetch(), 30_000);
    const onVisible = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        void (supabase as { removeChannel?: (c: unknown) => unknown }).removeChannel?.(channel);
      } catch {
        // nothing to clean up
      }
    };
  }, [refetch]);

  const pct = Math.round(soldShare(counts) * 100);
  return (
    <div className="mt-4 w-full max-w-sm max-sm:mt-3 sm:mt-0 sm:shrink-0" role="group" aria-label="How many personas are left">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="font-semibold text-neutral-50">
          <span className="tabular-nums">{counts.available}</span> available <span className="mx-1 text-neutral-600">·</span>{" "}
          <span className="tabular-nums text-neutral-300">{counts.sold}</span> <span className="text-neutral-300">sold</span>
        </p>
        <span className="text-xs text-neutral-500 tabular-nums">{pct}% gone</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Share of personas sold">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-iris-500 shadow-[0_0_12px_rgb(232_38_94/0.6)] transition-[width] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ width: `${pct}%`, minWidth: pct > 0 ? "0.5rem" : 0 }}
        />
      </div>
    </div>
  );
}
