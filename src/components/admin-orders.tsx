"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrder, markOrderPaid } from "@/app/(app)/admin/actions";
import { dollars } from "@/lib/plans";
import { cn } from "@/lib/utils";

export interface AdminOrder {
  id: string;
  user_id: string;
  email: string | null;
  kind: "pro" | "pack";
  pack_id: string | null;
  credits: number;
  amount_cents: number;
  first_month_bonus: boolean;
  status: "pending" | "paid" | "cancelled" | "failed";
  provider?: string | null;
  provider_status?: string | null;
  renews_order_id?: string | null;
  created_at: string;
  paid_at: string | null;
}

const PROVIDER_LABEL: Record<string, string> = { telegram: "Telegram", nowpayments: "crypto", manual: "manual", admin: "admin" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TONE: Record<AdminOrder["status"], string> = {
  pending: "bg-amber-400/15 text-amber-300 ring-amber-400/40",
  paid: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40",
  cancelled: "bg-neutral-800 text-neutral-400 ring-neutral-700",
  failed: "bg-red-500/15 text-red-300 ring-red-400/40",
};

/** Recent Pro and token-pack orders. Until checkout is connected, "Mark paid" delivers an order to test the flow. */
export function AdminOrders({ orders }: { orders: AdminOrder[] | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [pending, start] = useTransition();
  const run: Run = (fn, done) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: done, ok: true } : { text: r.error, ok: false });
      if (r.ok) router.refresh();
    });

  return (
    <section className="panel flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="orders-title">
      <div>
        <h2 id="orders-title" className="font-display text-lg font-bold text-neutral-50">Orders</h2>
        <p className="text-xs text-neutral-400 sm:text-sm">Telegram and crypto orders are delivered automatically when paid. &quot;Mark paid&quot; delivers one by hand. Cancelled orders clear after 24 hours.</p>
      </div>
      {orders === null ? (
        <p className="text-sm text-amber-300">Run migration 0023 in Supabase to turn on orders and tokens.</p>
      ) : !orders.length ? (
        <p className="text-sm text-neutral-500">No orders yet.</p>
      ) : (
        <>
          {/* Phones: one card per order. */}
          <ul className="-mx-1 flex flex-col divide-y divide-neutral-800/70 sm:hidden">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-1.5 px-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-100">{o.email ?? o.user_id.slice(0, 8)}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-neutral-50">{dollars(o.amount_cents)}</span>
                </div>
                <p className="text-sm text-neutral-300"><What o={o} /></p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-neutral-500">{when(o.created_at)}</span>
                  <Status s={o.status} />
                </div>
                {o.status === "pending" && <Actions o={o} pending={pending} run={run} className="mt-1" />}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 pr-3 font-medium">What</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-800/60">
                    <td className="whitespace-nowrap py-2 pr-3 text-neutral-400">{when(o.created_at)}</td>
                    <td className="max-w-[200px] truncate py-2 pr-3 text-neutral-200" title={o.email ?? o.user_id}>{o.email ?? o.user_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-neutral-200"><What o={o} /></td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-100">{dollars(o.amount_cents)}</td>
                    <td className="py-2 pr-3"><Status s={o.status} /></td>
                    <td className="py-2 text-right">{o.status === "pending" && <Actions o={o} pending={pending} run={run} className="justify-end" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
    </section>
  );
}

type Run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => void;

function What({ o }: { o: AdminOrder }) {
  return (
    <>
      {o.kind === "pro" ? (o.renews_order_id ? "Pro renewal" : "Pro, 30 days") : "Token pack"} · {o.credits.toLocaleString()} tokens
      {o.provider && <span className="ml-1.5 text-xs text-neutral-500">via {PROVIDER_LABEL[o.provider] ?? o.provider}{o.provider_status && o.status === "pending" ? ` (${o.provider_status})` : ""}</span>}
      {o.first_month_bonus && <span className="ml-1.5 text-xs text-[#ff8fc0]">first month</span>}
    </>
  );
}

const Status = ({ s }: { s: AdminOrder["status"] }) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", TONE[s])}>{s}</span>;

function Actions({ o, pending, run, className }: { o: AdminOrder; pending: boolean; run: Run; className?: string }) {
  return (
    <span className={cn("flex gap-1.5", className)}>
      <button type="button" disabled={pending} onClick={() => run(() => markOrderPaid(o.id), "Delivered.")} className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25 disabled:opacity-50">Mark paid</button>
      <button type="button" disabled={pending} onClick={() => run(() => cancelOrder(o.id), "Cancelled.")} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 disabled:opacity-50">Cancel</button>
    </span>
  );
}
