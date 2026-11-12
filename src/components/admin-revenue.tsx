import Link from "next/link";
import { REVENUE_RANGES, STAR_PAYOUT_USD, type Revenue } from "@/lib/admin-revenue";
import { cn } from "@/lib/utils";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CRYPTO = "bg-[#f7b23b]";
const TELEGRAM = "bg-[#2aabee]";

/** Admin → Orders: verified payments received over a chosen range, with a bar for each day, week or month. */
export function AdminRevenue({ r }: { r: Revenue }) {
  const max = Math.max(...r.buckets.map((b) => b.crypto + b.telegram), 0);
  const top = max > 0 ? niceMax(max) : 10;
  const per = r.unit === "day" ? "a day" : r.unit === "week" ? "a week" : "a month";
  // With many bars, only some get a date underneath.
  const every = Math.ceil(r.buckets.length / 7);
  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="revenue-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="revenue-title" className="text-sm font-medium text-neutral-400">Verified payments received</h2>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums text-neutral-50">{money(r.total)}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {r.orders} paid {r.orders === 1 ? "order" : "orders"} ·{" "}
            <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-sm", CRYPTO)} /> Crypto {money(r.crypto)}</span> ·{" "}
            <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-sm", TELEGRAM)} /> Telegram {money(r.telegram)}</span>{" "}
            <span className="text-neutral-500">(⭐ {r.telegramStars.toLocaleString()})</span>
          </p>
        </div>
        <nav aria-label="Range" className="flex flex-wrap gap-1 rounded-xl border border-neutral-800 bg-neutral-950/60 p-1">
          {REVENUE_RANGES.map((x) => (
            <Link
              key={x.id}
              href={`/admin?tab=orders&range=${x.id}`}
              scroll={false}
              aria-current={x.id === r.range ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", x.id === r.range ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100")}
            >
              {x.label}
            </Link>
          ))}
        </nav>
      </div>

      <div>
        <div className="flex gap-2">
          {/* The scale: top, middle and zero. */}
          <div className="flex h-48 w-14 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-neutral-500">
            <span>{money(top)}</span>
            <span>{money(top / 2)}</span>
            <span>$0</span>
          </div>
          <div className="relative flex h-48 flex-1 items-end gap-[2px] border-b border-l border-neutral-800 pl-1">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-neutral-800" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-800" />
            {r.buckets.map((b) => {
              const total = b.crypto + b.telegram;
              return (
                <div
                  key={b.start}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                  title={`${b.label}: ${money(total)} (crypto ${money(b.crypto)}, Telegram ${money(b.telegram)})`}
                >
                  {total > 0 && (
                    <div className="flex w-full flex-col overflow-hidden rounded-t-sm" style={{ height: `${(total / top) * 100}%` }}>
                      <div className={TELEGRAM} style={{ height: `${(b.telegram / total) * 100}%` }} />
                      <div className={cn("flex-1", CRYPTO)} />
                    </div>
                  )}
                  <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-100 group-hover:block">
                    {money(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ml-16 mt-1 flex gap-[2px] pl-1">
          {r.buckets.map((b, i) => (
            <span key={b.start} className="relative h-4 flex-1">
              {i % every === 0 && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-neutral-500">{b.label}</span>}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        One bar {per}. Crypto counts at its dollar price; Telegram at about ${STAR_PAYOUT_USD} per Star, what Telegram pays out.
        {r.manual > 0 && <> Orders marked paid by hand ({money(r.manual)}) aren&apos;t included.</>}
      </p>
    </section>
  );
}

/** A round number just above the biggest bar, for the scale. */
function niceMax(n: number): number {
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
