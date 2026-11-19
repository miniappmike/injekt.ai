"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { releaseCheckoutHold, startCheckout } from "@/app/(app)/billing/actions";
import { CryptoIcon, PlaneIcon } from "@/components/pay-buttons";
import { deviceId } from "@/lib/device-id";
import { TELEGRAM_GUIDE_PATH } from "@/lib/links";
import { formatPrice } from "@/lib/marketplace/view";
import { closeTab, openPayment, reserveTab } from "@/lib/payment-tab";
import { PERSONA_HOLD_MINUTES, personaStars } from "@/lib/plans";
import type { PayMethod } from "@/lib/payments/methods";
import { cn } from "@/lib/utils";

/** "14:59" until the hold ends; "0:00" after. */
function useCountdown(until: string | null): { left: number; text: string } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const left = until ? Math.max(0, Math.round((new Date(until).getTime() - now) / 1000)) : 0;
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

/**
 * "Buy for $29": a menu to pay with Telegram Stars or crypto. Choosing one holds her for this buyer for 15 minutes
 * (reserve_persona) and opens the payment in a new tab; the menu then shows a live countdown of the hold. She becomes
 * theirs (a copy of her full pictures and profile in their account) once the payment confirms.
 *
 * `look`: "glow" is the pink glowing pill on the dashboard's trending card; "pill" is the big white one on her page.
 */
export function PersonaCheckout({
  listingId,
  name,
  priceCents,
  signedIn,
  look = "pill",
  className,
  buttonClassName,
  align = "right",
  sheet = false,
  menuClassName,
}: {
  listingId: string;
  name: string;
  priceCents: number;
  signedIn: boolean;
  look?: "glow" | "pill";
  className?: string;
  buttonClassName?: string;
  /** Which edge of the button the menu lines up with. */
  align?: "left" | "right";
  /** Open the menu as a panel fixed at the bottom of the screen (for a button inside a small card that clips it). */
  sheet?: boolean;
  /** Extra classes for the menu, e.g. a narrower width inside a small card. */
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PayMethod | null>(null);
  const [error, setError] = useState<string>();
  const [held, setHeld] = useState<{ until: string; url: string; method: PayMethod } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { left, text } = useCountdown(held?.until ?? null);
  const stars = personaStars(priceCents);
  const label = `Buy for ${formatPrice(priceCents)}`;

  // A click or tap outside closes the menu (the hold stays; it is shown again when the menu reopens).
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function pay(method: PayMethod) {
    setError(undefined);
    setBusy(method);
    // The tab is opened during the click itself; browsers block one opened after the wait below.
    const tab = reserveTab();
    const r = await startCheckout({ kind: "persona", listingId }, deviceId(), method);
    setBusy(null);
    if (!r.ok || !r.order.checkoutUrl) {
      closeTab(tab);
      return setError(r.ok ? "Couldn't open the payment. Try again." : r.error);
    }
    setHeld({ until: r.order.heldUntil ?? new Date(Date.now() + PERSONA_HOLD_MINUTES * 60_000).toISOString(), url: r.order.checkoutUrl, method });
    openPayment(tab, r.order.checkoutUrl);
  }

  async function cancel() {
    setHeld(null);
    setOpen(false);
    await releaseCheckoutHold(listingId);
  }

  const trigger = cn(
    look === "glow"
      ? "inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[linear-gradient(90deg,#ff5fa2,#f92776)] px-4 py-2 text-sm font-extrabold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25),0_0_22px_4px_rgb(249_39_118/0.7),0_0_50px_8px_rgb(249_39_118/0.3)] transition hover:brightness-110 active:scale-95"
      : "flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[15px] font-bold text-neutral-950 shadow-[0_10px_30px_-10px_rgb(255_255_255/0.45)] transition-all hover:bg-neutral-200 active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
    buttonClassName,
  );

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/marketplace/${listingId}`)}`} className={cn(trigger, className)}>
        {label}
      </Link>
    );
  }

  const holdOn = !!held && left > 0;
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={trigger}>
        {holdOn ? `Held · ${text}` : label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Buy ${name}`}
          className={cn(
            "z-40 animate-pop-in rounded-2xl border border-neutral-700/80 bg-neutral-900/97 p-2 text-left shadow-[0_20px_50px_-10px_rgb(0_0_0/0.85)] backdrop-blur-xl",
            sheet
              ? "fixed inset-x-4 bottom-[calc(var(--dock-clear,0px)+1rem)] z-[60] mx-auto max-w-sm"
              : cn("absolute bottom-full mb-2 w-[min(18rem,calc(100vw-2rem))]", align === "right" ? "right-0" : "left-0"),
            menuClassName,
          )}
        >
          {holdOn ? (
            <div className="flex flex-col gap-2 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Held for you</p>
              <p className="font-poster text-5xl leading-none tabular-nums text-white" aria-live="off">{text}</p>
              <p className="text-sm leading-relaxed text-neutral-300">
                {name} is yours to buy for the next {Math.ceil(left / 60)} min while you pay in the {held!.method === "telegram" ? "Telegram" : "crypto"} tab. Nobody else can buy her until then.
              </p>
              <a href={held!.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-3 py-2 text-center text-sm font-bold text-neutral-950 hover:bg-neutral-200">
                Open the payment again
              </a>
              <p className="text-xs leading-relaxed text-neutral-500">Once it confirms she appears on your Characters page (crypto can take a few minutes).</p>
              <button type="button" onClick={cancel} className="w-fit text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline">
                Cancel and let her go
              </button>
            </div>
          ) : (
            <>
              <p className="px-2 pb-2 pt-1 text-xs text-neutral-400">
                Buy {name} · one of a kind. She&apos;s held for you for {PERSONA_HOLD_MINUTES} minutes while you pay.
              </p>
              {held && left === 0 && <p className="mx-2 mb-2 rounded-lg bg-amber-400/10 px-2 py-1.5 text-xs text-amber-200">Your hold ended. Choose again to hold her for another {PERSONA_HOLD_MINUTES} minutes.</p>}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => pay("telegram")}
                className="mb-1.5 flex w-full flex-col gap-0.5 rounded-xl bg-gradient-to-r from-[#37aee2] to-[#1e96c8] px-3 py-2.5 text-left text-white transition hover:brightness-110 disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-[15px] font-bold"><PlaneIcon className="h-4 w-4" /> {busy === "telegram" ? "Opening Telegram..." : "Pay with Telegram"}</span>
                <span className="text-xs text-white/85">⭐ {stars.toLocaleString()} Stars · card, Apple Pay, Google Pay</span>
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => pay("crypto")}
                className="flex w-full flex-col gap-0.5 rounded-xl border border-neutral-700 bg-neutral-950/60 px-3 py-2.5 text-left text-neutral-100 transition hover:border-neutral-500 disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-[15px] font-bold"><CryptoIcon className="h-4 w-4 text-[#f7b23b]" /> {busy === "crypto" ? "Opening..." : "Pay with crypto"}</span>
                <span className="text-xs text-neutral-400">{formatPrice(priceCents)} · USDC, BTC, ETH and more</span>
              </button>
              {error && <p role="alert" className="px-2 pt-2 text-xs text-red-400">{error}</p>}
              <Link href={TELEGRAM_GUIDE_PATH} target="_blank" className="block px-2 pt-2 text-xs font-medium text-[#7cc9f0] underline-offset-4 hover:underline">
                Short on Stars? How to pay with Telegram
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
