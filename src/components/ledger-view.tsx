"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLedger } from "@/app/(app)/ledger/actions";
import { formatUsd } from "@/lib/pricing";
import {
  COST_SOURCE_LABELS,
  featureLabel,
  jobLabel,
  ledgerCsv,
  LEDGER_RANGES,
  platformLabel,
  type LedgerEntry,
  type LedgerFilters,
  type LedgerJob,
  type LedgerRange,
  type PlatformSpend,
} from "@/lib/ledger-types";

const POLL_MS = 5000;
const PAGE = 50;
const select = "h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm";
const tz = () => new Date().getTimezoneOffset();
const tokens = (n: number | null) => (n === null ? "" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{formatUsd(value)}</p>
        {note && <p className="mt-1 text-xs text-amber-400">{note}</p>}
      </CardContent>
    </Card>
  );
}

// The person's ledger: what they spent on each API platform and every call behind it. Checks for new entries every few seconds.
export function LedgerView() {
  const [filters, setFilters] = useState<LedgerFilters>({ range: "month" });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<PlatformSpend[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  // Answers that arrive after the filters changed belong to the old view and are dropped.
  const version = useRef(0);
  const newestId = useRef<number | undefined>(undefined);

  const base = useCallback(
    () => ({ tzOffsetMinutes: tz(), range: filters.range, ...(filters.platform ? { platform: filters.platform } : {}), ...(filters.job ? { job: filters.job } : {}) }),
    [filters],
  );

  // Load from the top whenever the filters change.
  useEffect(() => {
    const mine = ++version.current;
    setStatus("loading");
    void getLedger({ ...base(), limit: PAGE }).then((page) => {
      if (mine !== version.current) return;
      if (!page) return setStatus("error");
      setEntries(page.entries);
      setSummary(page.summary);
      setHasMore(page.hasMore);
      newestId.current = page.entries[0]?.id;
      setUpdated(new Date());
      setStatus("ready");
    });
  }, [base]);

  // Pick up anything newer, and fresh totals, every few seconds while the tab is visible.
  useEffect(() => {
    if (status !== "ready") return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const mine = version.current;
      const page = await getLedger({ ...base(), limit: 100, ...(newestId.current ? { afterId: newestId.current } : {}) });
      if (!page || mine !== version.current) return;
      setSummary(page.summary);
      setUpdated(new Date());
      if (page.entries.length) {
        newestId.current = page.entries[0].id;
        setEntries((prev) => [...page.entries, ...prev.filter((p) => !page.entries.some((n) => n.id === p.id))]);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, base]);

  async function loadMore() {
    const oldest = entries[entries.length - 1]?.id;
    if (!oldest) return;
    setMoreBusy(true);
    const mine = version.current;
    const page = await getLedger({ ...base(), limit: PAGE, beforeId: oldest });
    setMoreBusy(false);
    if (!page || mine !== version.current) return;
    setEntries((prev) => [...prev, ...page.entries.filter((n) => !prev.some((p) => p.id === n.id))]);
    setHasMore(page.hasMore);
  }

  const shown = useMemo(() => (filters.platform ? summary.filter((s) => s.platform === filters.platform) : summary), [summary, filters.platform]);
  const total = (pick: (s: PlatformSpend) => number) => shown.reduce((a, s) => a + pick(s), 0);
  const unpriced = total((s) => s.unpricedCalls);
  const platforms = useMemo(() => {
    const ids = new Set(summary.map((s) => s.platform));
    if (filters.platform) ids.add(filters.platform);
    return [...ids].sort();
  }, [summary, filters.platform]);

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([ledgerCsv(entries)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "model-spawn-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Platform" className={select} value={filters.platform ?? ""} onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value || undefined }))}>
          <option value="">All platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
        </select>
        <select aria-label="Job" className={select} value={filters.job ?? ""} onChange={(e) => setFilters((f) => ({ ...f, job: (e.target.value || undefined) as LedgerJob | undefined }))}>
          <option value="">All jobs</option>
          <option value="vision">Vision</option>
          <option value="llm">Text</option>
          <option value="image">Image</option>
        </select>
        <select aria-label="Time range" className={select} value={filters.range} onChange={(e) => setFilters((f) => ({ ...f, range: e.target.value as LedgerRange }))}>
          {LEDGER_RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${status === "ready" ? "bg-emerald-500" : "bg-neutral-600"}`} aria-hidden="true" />
          {status === "ready" && updated ? `Live · updated ${updated.toLocaleTimeString()}` : status === "loading" ? "Loading..." : "Offline"}
        </span>
        <Button type="button" size="sm" variant="secondary" disabled={!entries.length} onClick={exportCsv}>Export CSV</Button>
      </div>

      {status === "error" && <p role="alert" className="text-sm text-red-400">Couldn&apos;t load your ledger. Reload the page to try again.</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="Today" value={total((s) => s.today)} />
        <Tile label="This month" value={total((s) => s.month)} />
        <Tile label="All time" value={total((s) => s.all)} note={unpriced ? `${unpriced} call${unpriced === 1 ? "" : "s"} couldn't be priced, so this is a little low.` : undefined} />
      </section>

      <section>
        <h2 className="mb-2 font-medium">By platform</h2>
        {summary.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nothing yet. Your first AI call will show up here with its cost. Make sure each model has a price on the{" "}
            <Link href="/settings/api-keys" className="underline">API keys</Link> page if it isn&apos;t one we know.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="p-2 font-normal">Platform</th>
                  <th className="p-2 text-right font-normal">Today</th>
                  <th className="p-2 text-right font-normal">This month</th>
                  <th className="p-2 text-right font-normal">All time</th>
                  <th className="p-2 text-right font-normal">Calls</th>
                  <th className="hidden p-2 text-right font-normal sm:table-cell">Tokens in / out</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.platform} className={`border-t border-neutral-800 ${filters.platform === s.platform ? "bg-neutral-900" : ""}`}>
                    <td className="p-2">
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => setFilters((f) => ({ ...f, platform: f.platform === s.platform ? undefined : s.platform }))}>
                        {platformLabel(s.platform)}
                      </button>
                    </td>
                    <td className="p-2 text-right">{formatUsd(s.today)}</td>
                    <td className="p-2 text-right">{formatUsd(s.month)}</td>
                    <td className="p-2 text-right">{formatUsd(s.all)}</td>
                    <td className="p-2 text-right">{s.calls}</td>
                    <td className="hidden p-2 text-right text-neutral-400 sm:table-cell">{tokens(s.inputTokens) || "0"} / {tokens(s.outputTokens) || "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Every call</h2>
        {status === "ready" && entries.length === 0 ? (
          <p className="text-sm text-neutral-400">No calls in this view.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="p-2 font-normal">Time</th>
                  <th className="p-2 font-normal">Platform</th>
                  <th className="p-2 font-normal">What</th>
                  <th className="hidden p-2 font-normal md:table-cell">Model</th>
                  <th className="hidden p-2 text-right font-normal sm:table-cell">Tokens in / out</th>
                  <th className="p-2 text-right font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-800 align-top">
                    <td className="whitespace-nowrap p-2 text-neutral-400">{when(e.createdAt)}</td>
                    <td className="p-2">{platformLabel(e.platform)}</td>
                    <td className="p-2">
                      {jobLabel(e.job)} · {featureLabel(e.feature)}
                      {e.status === "failed" && <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-xs text-red-300">failed</span>}
                      {e.keySource === "server" && <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">covered by Model Spawn</span>}
                    </td>
                    <td className="hidden max-w-[14rem] break-words p-2 text-xs text-neutral-500 md:table-cell">{e.model ?? ""}</td>
                    <td className="hidden p-2 text-right text-neutral-400 sm:table-cell">{e.inputTokens === null && e.outputTokens === null ? "–" : `${tokens(e.inputTokens)} / ${tokens(e.outputTokens)}`}</td>
                    <td className={`whitespace-nowrap p-2 text-right ${e.keySource === "server" ? "text-neutral-500" : ""}`}>
                      {e.costKnown ? (
                        <span title={e.costSource ? COST_SOURCE_LABELS[e.costSource] : undefined}>
                          {formatUsd(e.costUsd)}
                          {e.costSource && e.costSource !== "provider" ? <span className="ml-1 text-xs text-neutral-500">calc.</span> : null}
                        </span>
                      ) : (
                        <span className="text-amber-400" title="No price is known for this model, so this call couldn't be priced.">unpriced</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div className="mt-3">
            <Button type="button" variant="secondary" size="sm" disabled={moreBusy} onClick={loadMore}>{moreBusy ? "Loading..." : "Load more"}</Button>
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        Totals count calls made with your own keys. Image costs are what the provider reported. Text costs are the tokens used times a price per million
        tokens: the provider&apos;s list price where we have one, otherwise the price you enter on the API keys page (&ldquo;calc.&rdquo; marks those).
        Your provider&apos;s invoice is the final word.
      </p>
    </div>
  );
}
