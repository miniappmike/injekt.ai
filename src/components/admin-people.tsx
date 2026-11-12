"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlanSwitch } from "@/components/admin-console";
import { TokenIcon } from "@/components/token-icon";
import { Input } from "@/components/ui/input";
import type { UserStats } from "@/lib/admin-stats";
import { cn } from "@/lib/utils";

type Extras = Record<string, { tokens: number; paidUsd: number; paidOrders: number }>;
type Show = "all" | "free" | "pro" | "admin" | "paying" | "active7" | "ownkey" | "limit";
type Sort = "active" | "newest" | "tokens" | "paid" | "cost" | "prompts";

const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) : "—");

/** Admin → People: everyone, with what they've paid, their tokens and what they cost your key. Click a row for more. */
export function AdminPeople({ users, extras, freeRunCap }: { users: UserStats[]; extras: Extras; freeRunCap: number }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("active");
  const ex = (id: string) => extras[id] ?? { tokens: 0, paidUsd: 0, paidOrders: 0 };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const week = Date.now() - 7 * 86_400_000;
    const out = users.filter((u) => {
      if (s && !(u.email ?? u.id).toLowerCase().includes(s)) return false;
      switch (show) {
        case "free": return !u.is_admin && u.plan === "free";
        case "pro": return !u.is_admin && u.plan === "pro";
        case "admin": return u.is_admin;
        case "paying": return ex(u.id).paidOrders > 0;
        case "active7": return !!u.lastActive && Date.parse(u.lastActive) >= week;
        case "ownkey": return u.ownKey;
        case "limit": return !u.is_admin && u.plan === "free" && u.runsToday >= freeRunCap;
        default: return true;
      }
    });
    const key = (u: UserStats): number => {
      switch (sort) {
        case "newest": return Date.parse(u.created_at ?? "") || 0;
        case "tokens": return ex(u.id).tokens;
        case "paid": return ex(u.id).paidUsd;
        case "cost": return u.server30;
        case "prompts": return u.runs7;
        default: return Date.parse(u.lastActive ?? "") || 0;
      }
    };
    return out.sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, extras, q, show, sort, freeRunCap]);

  const totals = useMemo(() => {
    const paying = users.filter((u) => ex(u.id).paidOrders > 0).length;
    const pro = users.filter((u) => !u.is_admin && u.plan === "pro").length;
    return { people: users.length, paying, pro };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, extras]);

  const select = "h-10 min-w-0 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm";
  return (
    <section className="panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="people-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="people-title" className="font-display text-lg font-bold text-neutral-50">People</h2>
          <p className="text-xs text-neutral-400 sm:text-sm">
            {totals.people} people · {totals.pro} on Pro · {totals.paying} have paid. Tap someone to see their activity and manage their tokens.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Input placeholder="Search email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" className="col-span-2 sm:w-48" />
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show" className={select}>
            <option value="all">Everyone</option>
            <option value="free">Free plan</option>
            <option value="pro">Pro</option>
            <option value="admin">Admins</option>
            <option value="paying">Have paid</option>
            <option value="active7">Active in 7 days</option>
            <option value="ownkey">Own AI key</option>
            <option value="limit">Hit today&apos;s limit</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className={select}>
            <option value="active">Last active</option>
            <option value="newest">Newest</option>
            <option value="paid">Paid the most</option>
            <option value="tokens">Most tokens</option>
            <option value="cost">Costs your key the most</option>
            <option value="prompts">Most prompts (7d)</option>
          </select>
        </div>
      </div>
      {/* Phones: one card per person. */}
      <ul className="-mx-1 flex flex-col divide-y divide-neutral-800/70 sm:hidden">
        {list.map((u) => {
          const e = ex(u.id);
          const proPass = u.proUntil && Date.parse(u.proUntil) > Date.now();
          return (
            <li key={u.id} className="flex items-center gap-3 px-1 py-3">
              <Link href={`/admin/people/${u.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-semibold text-neutral-50">{u.email ?? u.id.slice(0, 8)}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-400">
                  <span className="inline-flex items-center gap-1 tabular-nums text-neutral-200"><TokenIcon className="h-3 w-3" />{e.tokens.toLocaleString()}</span>
                  {e.paidUsd > 0 && <span className="font-semibold tabular-nums text-emerald-300">${e.paidUsd.toFixed(2)} paid</span>}
                  <span>active {ago(u.lastActive)}</span>
                  {u.ownKey && <span className="text-emerald-300">Own AI key</span>}
                  {proPass && <span className="text-[#ff8fc0]">Pro until {day(u.proUntil)}</span>}
                </span>
              </Link>
              <span className="shrink-0"><PlanSwitch user={u} /></span>
            </li>
          );
        })}
        {!list.length && <li className="py-6 text-center text-sm text-neutral-500">Nobody matches.</li>}
      </ul>
      <div className="-mx-5 hidden overflow-x-auto px-5 sm:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 text-right font-medium">Tokens</th>
              <th className="py-2 pr-3 text-right font-medium">Paid</th>
              <th className="py-2 pr-3 text-right font-medium">Your cost 30d</th>
              <th className="py-2 pr-3 text-right font-medium">Prompts 7d</th>
              <th className="py-2 pr-3 text-right font-medium">Joined</th>
              <th className="py-2 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const e = ex(u.id);
              const href = `/admin/people/${u.id}`;
              const proPass = u.proUntil && Date.parse(u.proUntil) > Date.now();
              return (
                <tr key={u.id} className="border-b border-neutral-800/60 transition-colors hover:bg-neutral-800/30">
                  <td className="max-w-[240px] py-2 pr-3">
                    <Link href={href} className="block truncate font-medium text-neutral-100 hover:text-brand-300 hover:underline" title={u.email ?? u.id}>
                      {u.email ?? u.id.slice(0, 8)}
                    </Link>
                    <span className="flex gap-2 text-[11px]">
                      {u.ownKey && <span className="text-emerald-300">Own AI key</span>}
                      {proPass && <span className="text-[#ff8fc0]">Pro until {day(u.proUntil)}</span>}
                    </span>
                  </td>
                  <td className="py-2 pr-3"><PlanSwitch user={u} /></td>
                  <td className="py-2 pr-3 text-right">
                    <span className="inline-flex items-center gap-1 tabular-nums text-neutral-100"><TokenIcon className="h-3.5 w-3.5" />{e.tokens.toLocaleString()}</span>
                  </td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", e.paidUsd > 0 ? "font-semibold text-emerald-300" : "text-neutral-500")}>
                    {e.paidUsd > 0 ? `$${e.paidUsd.toFixed(2)}` : "—"}
                    {e.paidOrders > 0 && <span className="block text-[11px] font-normal text-neutral-500">{e.paidOrders} {e.paidOrders === 1 ? "order" : "orders"}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-200">{usd(u.server30)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-200">{u.runs7}</td>
                  <td className="py-2 pr-3 text-right text-xs text-neutral-400">{day(u.created_at)}</td>
                  <td className="py-2 text-right text-xs text-neutral-400">{ago(u.lastActive)}</td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">Nobody matches.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
