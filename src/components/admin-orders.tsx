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
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: done, ok: true } : { text: r.error, ok: false });
      if (r.ok) router.refresh();
    });

  return (
    <section className="panel mt-6 flex flex-col gap-3 p-5" aria-labelledby="orders-title">
      <div>
        <h2 id="orders-title" className="font-display text-lg font-bold text-neutral-50">Orders</h2>
        <p className="text-sm text-neutral-400">Telegram and crypto orders are delivered automatically when paid. &quot;Mark paid&quot; delivers an order by hand (for example, a payment you confirmed yourself).</p>
      </div>
      {orders === null ? (
        <p className="text-sm text-amber-300">Run migration 0023 in Supabase to turn on orders and tokens.</p>
      ) : !orders.length ? (
        <p className="text-sm text-neutral-500">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
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
                  <td className="py-2 pr-3 text-neutral-400">{when(o.created_at)}</td>
                  <td className="max-w-[200px] truncate py-2 pr-3 text-neutral-200" title={o.email ?? o.user_id}>{o.email ?? o.user_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 text-neutral-200">
                    {o.kind === "pro" ? (o.renews_order_id ? "Pro renewal" : "Pro, 30 days") : "Token pack"} · {o.credits.toLocaleString()} tokens
                    {o.provider && <span className="ml-1.5 text-xs text-neutral-500">via {PROVIDER_LABEL[o.provider] ?? o.provider}{o.provider_status && o.status === "pending" ? ` (${o.provider_status})` : ""}</span>}
                    {o.first_month_bonus && <span className="ml-1.5 text-xs text-[#ff8fc0]">first month</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-100">{dollars(o.amount_cents)}</td>
                  <td className="py-2 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", TONE[o.status])}>{o.status}</span></td>
                  <td className="py-2 text-right">
                    {o.status === "pending" && (
                      <span className="flex justify-end gap-1.5">
                        <button type="button" disabled={pending} onClick={() => run(() => markOrderPaid(o.id), "Delivered.")} className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25 disabled:opacity-50">Mark paid</button>
                        <button type="button" disabled={pending} onClick={() => run(() => cancelOrder(o.id), "Cancelled.")} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 disabled:opacity-50">Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
    </section>
  );
}
