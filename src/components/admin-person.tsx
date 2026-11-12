import Link from "next/link";
import type { PersonDetail } from "@/lib/admin-data";
import { AdminTokenAdjust } from "@/components/admin-token-adjust";
import { TokenIcon } from "@/components/token-icon";
import { featureLabel } from "@/lib/ledger-types";
import { AdminCopy } from "@/components/admin-copy";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const amount = (o: { provider: string | null; amount_stars: number | null; amount_cents: number }) =>
  o.provider === "telegram" && o.amount_stars ? `⭐ ${o.amount_stars}` : `$${(o.amount_cents / 100).toFixed(2)}`;
const VIA: Record<string, string> = { telegram: "Telegram", nowpayments: "crypto", manual: "manual", admin: "admin" };

/** Admin → People → one person: plan, tokens (with add and remove), token activity, orders, and calls on your key. */
export function AdminPerson({ p }: { p: PersonDetail }) {
  const card = "panel p-4 sm:p-5";
  const h2 = "font-display text-base font-bold text-neutral-50";
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Link href="/admin?tab=people" className="text-sm font-semibold text-neutral-400 hover:text-neutral-100">← People</Link>
      {/* The contact comes first: their email, big, on phones and computers alike. */}
      <header className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-iris-500 font-display text-2xl font-bold uppercase text-white">
          {(p.email ?? "?").slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-all font-display text-2xl font-extrabold leading-tight text-neutral-50 sm:text-3xl">{p.email ?? "No email"}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${p.isAdmin ? "bg-iris-500/15 text-iris-400 ring-iris-500/40" : p.plan === "pro" ? "bg-brand-500/15 text-[#ff8fc0] ring-brand-500/40" : "bg-neutral-800 text-neutral-300 ring-neutral-700"}`}>
              {p.isAdmin ? "Admin" : p.plan === "pro" ? "Pro" : "Free plan"}
            </span>
            {p.proUntil && <span className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-neutral-300">Pro pass {Date.parse(p.proUntil) > Date.now() ? "until" : "ended"} {day(p.proUntil)}</span>}
            <span className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-neutral-300">Joined {day(p.createdAt)}</span>
            <span className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-neutral-300">Last sign-in {day(p.lastSignIn)}</span>
          </div>
        </div>
        {p.email && (
          <div className="flex gap-2 sm:shrink-0">
            <a href={`mailto:${p.email}`} className="flex-1 rounded-lg bg-brand-500 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-brand-400 sm:flex-none">Email</a>
            <AdminCopy text={p.email} label="Copy email" className="flex-1 sm:flex-none" />
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card} aria-labelledby="tokens-title">
          <h2 id="tokens-title" className={h2}>Tokens</h2>
          <p className="mt-2 flex items-center gap-2 font-display text-3xl font-bold tabular-nums text-neutral-50"><TokenIcon className="h-7 w-7" />{p.tokens.total.toLocaleString()}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Pro month {p.tokens.monthly} · Bought {p.tokens.bought} · Free {p.tokens.free} · Added by admin {p.tokens.added}
          </p>
          <div className="mt-4"><AdminTokenAdjust userId={p.id} email={p.email ?? "this person"} /></div>
        </section>

        <section className={card} aria-labelledby="activity-title">
          <h2 id="activity-title" className={h2}>Token activity</h2>
          {p.activity.length ? (
            <ul className="mt-3 flex max-h-72 flex-col divide-y divide-neutral-800/70 overflow-y-auto text-sm">
              {p.activity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-neutral-300">{a.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-neutral-500">{when(a.at)}</span>
                    <span className={`w-12 text-right font-semibold tabular-nums ${a.delta > 0 ? "text-emerald-300" : a.delta < 0 ? "text-neutral-200" : "text-neutral-500"}`}>{a.delta > 0 ? `+${a.delta}` : a.delta || "0"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Nothing yet.</p>
          )}
        </section>
      </div>

      <section className={card} aria-labelledby="orders-title">
        <h2 id="orders-title" className={h2}>Orders</h2>
        {p.orders.length ? (
          <>
          <ul className="mt-2 flex flex-col divide-y divide-neutral-800/70 sm:hidden">
            {p.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-neutral-200">{o.kind === "pro" ? "Pro" : "Token pack"} · {o.credits} tokens</span>
                  <span className="block text-xs text-neutral-500">{when(o.created_at)} · {VIA[o.provider ?? ""] ?? "—"} · {o.status}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-neutral-100">{amount(o)}</span>
              </li>
            ))}
          </ul>
          <div className="-mx-5 mt-3 hidden overflow-x-auto px-5 sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                  <th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">What</th><th className="py-2 pr-3 font-medium">Via</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {p.orders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-800/60">
                    <td className="py-2 pr-3 text-neutral-400">{when(o.created_at)}</td>
                    <td className="py-2 pr-3 text-neutral-200">{o.kind === "pro" ? "Pro" : "Token pack"} · {o.credits} tokens</td>
                    <td className="py-2 pr-3 text-neutral-400">{VIA[o.provider ?? ""] ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-100">{amount(o)}</td>
                    <td className="py-2 text-neutral-300">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No orders.</p>
        )}
      </section>

      <section className={card} aria-labelledby="ledger-title">
        <h2 id="ledger-title" className={h2}>Calls on your key</h2>
        <p className="mt-1 text-sm text-neutral-400">Their last 100 calls paid by your SpicyAPI key. Last 30 days: <b className="text-neutral-100">{usd(p.ledger30)}</b>.</p>
        {p.ledger.length ? (
          <>
          <ul className="mt-2 flex max-h-96 flex-col divide-y divide-neutral-800/70 overflow-y-auto sm:hidden">
            {p.ledger.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-neutral-200">{l.feature ? featureLabel(l.feature) : "—"}</span>
                  <span className="block truncate text-xs text-neutral-500">{when(l.at)}{l.status ? ` · ${l.status}` : ""}{l.model ? ` · ${l.model}` : ""}</span>
                </span>
                <span className="shrink-0 tabular-nums text-neutral-100">{l.cost === null ? "—" : usd(l.cost)}{!l.settled && l.cost !== null && <span className="ml-1 text-[10px] text-neutral-500">est.</span>}</span>
              </li>
            ))}
          </ul>
          <div className="-mx-5 mt-3 hidden max-h-96 overflow-auto px-5 sm:block">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                  <th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">What</th><th className="py-2 pr-3 font-medium">Model</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {p.ledger.map((l, i) => (
                  <tr key={i} className="border-b border-neutral-800/60">
                    <td className="py-1.5 pr-3 text-neutral-400">{when(l.at)}</td>
                    <td className="py-1.5 pr-3 text-neutral-200">{l.feature ? featureLabel(l.feature) : "—"}</td>
                    <td className="max-w-[220px] truncate py-1.5 pr-3 text-xs text-neutral-400" title={l.model ?? ""}>{l.model ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-neutral-400">{l.status ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-neutral-100">{l.cost === null ? "—" : usd(l.cost)}{!l.settled && l.cost !== null && <span className="ml-1 text-[10px] text-neutral-500">est.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No calls on your key.</p>
        )}
      </section>
    </div>
  );
}
