"use client";

import { useCallback, useState, useTransition } from "react";
import { startCheckout } from "@/app/(app)/billing/actions";
import { bonusPercent, dollars, perCredit, type CreditPack } from "@/lib/plans";
import { deviceId } from "@/lib/device-id";
import { TokenIcon } from "@/components/token-icon";
import { cn } from "@/lib/utils";
import { PackPayButtons } from "@/components/pay-buttons";
import { closeTab, openPayment, reserveTab } from "@/lib/payment-tab";
import { TelegramPayDialog } from "@/components/telegram-pay-dialog";
import type { PayMethod, PayMethods } from "@/lib/payments/methods";

/** The four token packs, each with its ways to pay (Telegram Stars, crypto). Paying opens the provider's page. */
export function BuyPacks({ packs, methods }: { packs: CreditPack[]; methods: PayMethods }) {
  const [busy, setBusy] = useState<{ pack: string; method: PayMethod } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [, start] = useTransition();

  // Telegram first shows a short pop-up (with the guide), whose Continue to payment makes the link.
  const [telegramPack, setTelegramPack] = useState<CreditPack | null>(null);
  const closeTelegram = useCallback(() => setTelegramPack(null), []);
  const telegramLink = async (): Promise<{ url: string } | { error: string }> => {
    if (!telegramPack) return { error: "Choose a pack first." };
    const r = await startCheckout({ kind: "pack", packId: telegramPack.id }, deviceId(), "telegram");
    return r.ok && r.order.checkoutUrl ? { url: r.order.checkoutUrl } : { error: r.ok ? "Couldn't open the payment. Try again." : r.error };
  };

  function pay(p: CreditPack, method: PayMethod) {
    if (method === "telegram") return setTelegramPack(p);
    setBusy({ pack: p.id, method });
    setMsg(undefined);
    // Crypto opens in a new tab, so the site stays open here.
    const tab = reserveTab();
    start(async () => {
      const r = await startCheckout({ kind: "pack", packId: p.id }, deviceId(), method);
      if (!r.ok || !r.order.checkoutUrl) {
        closeTab(tab);
        setBusy(null);
        return setMsg({ text: r.ok ? "Couldn't open the payment. Try again." : r.error, ok: false });
      }
      if (openPayment(tab, r.order.checkoutUrl) === "tab") {
        setBusy(null);
        setMsg({ text: `The payment opened in a new tab. Your ${p.credits.toLocaleString()} tokens are added as soon as it confirms (usually a few minutes): refresh this page to see them.`, ok: true });
      }
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
              <PackPayButtons
                methods={methods}
                stars={p.stars}
                price={dollars(p.priceCents)}
                featured={featured}
                busy={busy?.pack === p.id ? busy.method : null}
                disabled={busy !== null}
                onPay={(m) => pay(p, m)}
              />
            </div>
          );
        })}
      </div>
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
      <TelegramPayDialog
        open={!!telegramPack}
        what={telegramPack ? `${telegramPack.credits.toLocaleString()} tokens` : ""}
        stars={telegramPack?.stars ?? 0}
        onClose={closeTelegram}
        makeLink={telegramLink}
      />
    </div>
  );
}
