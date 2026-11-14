"use client";

import { cn } from "@/lib/utils";
import type { PayMethod, PayMethods } from "@/lib/payments/methods";

/** A paper plane, for Telegram. */
export function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-4 w-4 fill-current", className)}>
      <path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5ZM9.7 14.3l-.4 3.9-1.3-4.3 10.9-6.9-9.2 7.3Z" />
    </svg>
  );
}

/** A coin stack, for crypto. */
export function CryptoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-4 w-4 fill-none stroke-current", className)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

const TELEGRAM_BG = "bg-gradient-to-r from-[#37aee2] to-[#1e96c8]";

/** Pro checkout: Telegram (card, Apple Pay, Google Pay, renews monthly) or crypto (30 days). */
export function ProPayButtons({
  methods,
  stars,
  price,
  busy,
  onPay,
}: {
  methods: PayMethods;
  stars: number;
  price: string;
  busy: PayMethod | null;
  onPay: (m: PayMethod) => void;
}) {
  const card = "flex flex-col items-center gap-1 rounded-2xl px-5 py-3.5 text-center transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
  if (!methods.telegram && !methods.crypto) return <p className="text-sm text-neutral-400">Checkout isn't available right now. Try again shortly.</p>;
  return (
    <div className={cn("grid w-full max-w-xl gap-3", methods.telegram && methods.crypto && "sm:grid-cols-2")}>
      {methods.telegram && (
        <button type="button" disabled={busy !== null} onClick={() => onPay("telegram")} className={cn(card, TELEGRAM_BG, "text-white shadow-[0_12px_32px_-12px_rgb(42_171_238/0.8)]")}>
          <span className="flex items-center gap-2 text-base font-semibold"><PlaneIcon className="h-5 w-5" /> {busy === "telegram" ? "Opening Telegram..." : "Pay with Telegram"}</span>
          <span className="text-sm font-semibold tabular-nums">⭐ {stars.toLocaleString()} / month</span>
          <span className="text-xs text-white/80">Card, Apple Pay or Google Pay · renews monthly</span>
        </button>
      )}
      {methods.crypto && (
        <button type="button" disabled={busy !== null} onClick={() => onPay("crypto")} className={cn(card, "border border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500")}>
          <span className="flex items-center gap-2 text-base font-semibold"><CryptoIcon className="h-5 w-5 text-[#f7b23b]" /> {busy === "crypto" ? "Opening..." : "Pay with crypto"}</span>
          <span className="text-sm font-semibold tabular-nums">{price} for 30 days</span>
          <span className="text-xs text-neutral-400">USDC, BTC, ETH and more · renew when you like</span>
        </button>
      )}
    </div>
  );
}

/** A token pack's checkout buttons. */
export function PackPayButtons({
  methods,
  stars,
  price,
  featured,
  busy,
  disabled = false,
  onPay,
}: {
  methods: PayMethods;
  stars: number;
  price: string;
  featured?: boolean;
  busy: PayMethod | null;
  disabled?: boolean;
  onPay: (m: PayMethod) => void;
}) {
  if (!methods.telegram && !methods.crypto) return <p className="mt-auto text-center text-xs text-neutral-500">Checkout isn't available right now. Try again shortly.</p>;
  return (
    <div className="mt-auto flex flex-col gap-2">
      {methods.telegram && (
        <button
          type="button"
          disabled={busy !== null || disabled}
          onClick={() => onPay("telegram")}
          aria-label={`Pay ${stars} Stars with Telegram`}
          className={cn("flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60", TELEGRAM_BG, featured && "shadow-[0_10px_24px_-10px_rgb(42_171_238/0.8)]")}
        >
          <PlaneIcon className="h-4 w-4 shrink-0" />
          {busy === "telegram" ? (
            <span>Opening...</span>
          ) : (
            <>
              <span className="whitespace-nowrap tabular-nums">⭐ {stars.toLocaleString()}</span>
              <span className="hidden whitespace-nowrap sm:inline">· Telegram</span>
            </>
          )}
        </button>
      )}
      {methods.crypto && (
        <button
          type="button"
          disabled={busy !== null || disabled}
          onClick={() => onPay("crypto")}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-neutral-500 disabled:opacity-60"
        >
          <CryptoIcon className="h-3.5 w-3.5 text-[#f7b23b]" /> {busy === "crypto" ? "Opening..." : `${price} · Crypto`}
        </button>
      )}
    </div>
  );
}
