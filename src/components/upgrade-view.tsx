"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startCheckout } from "@/app/(app)/billing/actions";
import { ProGem, ProWord } from "@/components/pro-badge";
import { FREE_CREDITS, PRO, dollars } from "@/lib/plans";
import { deviceId } from "@/lib/device-id";
import { cn } from "@/lib/utils";
import { ProPayButtons } from "@/components/pay-buttons";
import type { PayMethod, PayMethods } from "@/lib/payments/methods";
import { TokenIcon } from "@/components/token-icon";

type Choice = "free" | "pro";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

const INCLUDED: { icon: React.ReactNode; label: string }[] = [
  { icon: "🔑", label: "Your own API keys" },
  { icon: <TokenIcon className="h-3.5 w-3.5" />, label: `${PRO.firstMonthCredits} tokens first month` },
  { icon: <TokenIcon className="h-3.5 w-3.5" />, label: `${PRO.monthlyCredits} tokens every month` },
  { icon: "∞", label: "No daily limits" },
  { icon: "👥", label: "Unlimited characters" },
];

/**
 * The Pro page: stay Free, or Pro for $9.99 a month. Two cards, what's included, and one Continue button. Pro is a
 * 30-day pass renewed by hand (nothing charges again by itself).
 */
export function UpgradeView({
  plan,
  proUntil,
  bonusNote,
  methods,
}: {
  plan: "free" | "pro" | "admin";
  proUntil: string | null;
  bonusNote: string | null;
  methods: PayMethods;
}) {
  const router = useRouter();
  const isPro = plan !== "free";
  const [choice, setChoice] = useState<Choice>("pro");
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<PayMethod | null>(null);
  const firstMonth = !bonusNote && !isPro;
  const credits = firstMonth ? PRO.firstMonthCredits : PRO.monthlyCredits;

  // Opens the chosen payment page: Telegram (Stars) or NOWPayments (crypto). The order is delivered when they pay.
  function pay(method: PayMethod) {
    setMsg(undefined);
    setBusy(method);
    start(async () => {
      const r = await startCheckout({ kind: "pro" }, deviceId(), method);
      if (!r.ok || !r.order.checkoutUrl) {
        setBusy(null);
        return setMsg({ text: r.ok ? "Couldn't open the payment. Try again." : r.error, ok: false });
      }
      window.location.href = r.order.checkoutUrl;
    });
  }

  const card = "relative flex flex-col gap-3 rounded-2xl p-5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70";
  const radio = (on: boolean) => (
    <span aria-hidden="true" className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-400" : "border-neutral-600")}>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />}
    </span>
  );

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-bold text-neutral-200">Upgrade Model Spawn</h1>
        <button
          type="button"
          onClick={() => (history.length > 1 ? router.back() : router.push("/characters"))}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full bg-neutral-800/80 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 stroke-current" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      </div>

      <div className="mt-8 flex flex-col items-center text-center sm:mt-12">
        {/* Soft pink light behind the title. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-16 h-48 w-[28rem] max-w-full -translate-x-1/2 rounded-full bg-[#f92776]/15 blur-3xl" />
        <p className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-display text-5xl font-bold tracking-tight text-neutral-50 sm:text-6xl">
          <span>Model Spawn</span>
          <span className="flex items-center gap-3">
            <ProGem className="h-12 w-12 sm:h-16 sm:w-16" />
            <ProWord className="pr-2 text-5xl sm:text-6xl" />
          </span>
        </p>
        <p className="relative mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
          {isPro && proUntil ? (
            <>You&apos;re on Pro until <b className="text-neutral-100">{day(proUntil)}</b>. Renew any time to add 30 more days and {PRO.monthlyCredits} tokens.</>
          ) : isPro ? (
            <>Your account already has Pro.</>
          ) : (
            <>Use your own API keys with no daily limits, plus <b className="text-neutral-100">{credits} tokens</b> {firstMonth ? "your first month" : "a month"}.</>
          )}
        </p>
      </div>

      <div role="radiogroup" aria-label="Choose a plan" className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
        <button
          type="button"
          role="radio"
          aria-checked={choice === "free"}
          onClick={() => setChoice("free")}
          disabled={isPro}
          className={cn(card, "border bg-neutral-900/70", choice === "free" ? "border-brand-400/70 shadow-[0_0_0_3px_rgb(249_39_118/0.15)]" : "border-neutral-800 hover:border-neutral-700", isPro && "opacity-50")}
        >
          <span className="flex items-center gap-2.5 text-lg font-semibold text-neutral-100">{radio(choice === "free")} Stay Free</span>
          <span className="border-t border-neutral-800" />
          <span>
            <span className="block font-semibold text-neutral-100">{FREE_CREDITS} tokens, once</span>
            <span className="mt-0.5 block text-sm text-neutral-500">Daily limits · tokens only</span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={choice === "pro"}
          onClick={() => setChoice("pro")}
          className={cn(
            card,
            "overflow-hidden border bg-gradient-to-br from-neutral-900 via-neutral-950 to-[#2a0b18]",
            choice === "pro" ? "border-[#f92776]/80 shadow-[0_0_0_3px_rgb(249_39_118/0.2),0_20px_50px_-20px_rgb(249_39_118/0.6)]" : "border-neutral-800 hover:border-neutral-700",
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5 text-lg font-semibold text-neutral-50">{radio(choice === "pro")} Pro</span>
            {firstMonth && <span className="rounded-full bg-[#f92776]/20 px-2 py-0.5 text-[11px] font-bold text-[#ff8fc0] ring-1 ring-[#f92776]/50">+{PRO.firstMonthCredits - PRO.monthlyCredits} bonus</span>}
          </span>
          <span className="border-t border-white/10" />
          <span>
            <span className="block font-semibold text-neutral-50">{dollars(PRO.priceCents)} / month</span>
            <span className="mt-0.5 block text-sm text-neutral-400">{credits} tokens · Telegram or crypto</span>
          </span>
        </button>
      </div>

      <div className="mx-auto mt-8 max-w-xl">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="h-px flex-1 bg-neutral-800" />
          What&apos;s included in Pro
          <span className="h-px flex-1 bg-neutral-800" />
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {INCLUDED.map((i) => (
            <li key={i.label} className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-[0_6px_16px_-10px_rgb(0_0_0/0.9)]">
              <span aria-hidden="true" className="text-sm leading-none text-[#ff5fa2]">{i.icon}</span>
              {i.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        {choice === "pro" ? (
          <ProPayButtons methods={methods} stars={PRO.stars} price={dollars(PRO.priceCents)} busy={busy} onPay={pay} />
        ) : (
          <button
            type="button"
            onClick={() => router.push("/characters")}
            className="min-w-48 rounded-full bg-gradient-to-r from-[#ff5fa2] to-[#f92776] px-8 py-3 font-semibold text-white shadow-[0_12px_32px_-10px_rgb(249_39_118/0.8)] transition hover:brightness-110"
          >
            Continue to app
          </button>
        )}
        {msg && <p role="status" className={cn("max-w-md text-center text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
        {bonusNote && !isPro && choice === "pro" && <p className="max-w-md text-center text-xs text-amber-300/90">{bonusNote}</p>}
        <p className="max-w-md text-center text-xs leading-relaxed text-neutral-500">
          Paid with Telegram, Pro renews every 30 days until you cancel it in Telegram. Paid with crypto, it lasts 30 days and we remind you before it ends. Monthly tokens expire at the end of each 30 days; tokens you buy never expire.{" "}
          <Link href="/tokens" className="font-semibold text-neutral-300 underline-offset-4 hover:underline">Need more tokens?</Link>
        </p>
      </div>
    </div>
  );
}
