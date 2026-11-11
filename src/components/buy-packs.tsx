"use client";

import { useState, useTransition } from "react";
import { startCheckout } from "@/app/(app)/billing/actions";
import { bonusPercent, dollars, perCredit, type CreditPack } from "@/lib/plans";
import { deviceId } from "@/lib/device-id";
import { TokenIcon } from "@/components/token-icon";
import { cn } from "@/lib/utils";

/** The four token packs, each with a Buy button. Checkout isn't connected yet: the order is saved and the page says so. */
export function BuyPacks({ packs }: { packs: CreditPack[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [, start] = useTransition();

  function buy(p: CreditPack) {
    setBusy(p.id);
    setMsg(undefined);
    start(async () => {
      const r = await startCheckout({ kind: "pack", packId: p.id }, deviceId());
      setBusy(null);
      if (!r.ok) return setMsg({ text: r.error, ok: false });
      if (r.order.checkoutUrl) return void (window.location.href = r.order.checkoutUrl);
      setMsg({ text: `Checkout is almost ready. Your order for ${p.credits.toLocaleString()} tokens is saved, and you'll be able to pay for it here very soon.`, ok: true });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {packs.map((p) => {
          const extra = bonusPercent(p);
          const featured = p.tag === "Popular";
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex flex-col gap-3 rounded-2xl border p-4 transition-colors",
                featured ? "border-[#f92776]/70 bg-gradient-to-b from-[#2a0b18] to-neutral-950 shadow-[0_20px_50px_-25px_rgb(249_39_118/0.7)]" : "border-neutral-800 bg-neutral-900/70 hover:border-neutral-700",
              )}
            >
              {p.tag && (
                <span className={cn("absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[11px] font-bold", featured ? "bg-[#f92776] text-white" : "bg-neutral-800 text-neutral-300 ring-1 ring-neutral-700")}>{p.tag}</span>
              )}
              <div className="flex items-center gap-2">
                <TokenIcon className="h-6 w-6" />
                <span className="font-display text-2xl font-bold tabular-nums text-neutral-50">{p.credits.toLocaleString()}</span>
              </div>
              <div className="text-xs text-neutral-400">
                {perCredit(p)} per token
                {extra > 0 && <span className="ml-1.5 font-semibold text-emerald-300">+{extra}% more</span>}
              </div>
              <button
                type="button"
                onClick={() => buy(p)}
                disabled={busy !== null}
                className={cn(
                  "mt-auto rounded-xl py-2 text-sm font-semibold transition disabled:opacity-60",
                  featured ? "bg-gradient-to-r from-[#ff5fa2] to-[#f92776] text-white hover:brightness-110" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
                )}
              >
                {busy === p.id ? "One moment..." : `Buy for ${dollars(p.priceCents)}`}
              </button>
            </div>
          );
        })}
      </div>
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
    </div>
  );
}
