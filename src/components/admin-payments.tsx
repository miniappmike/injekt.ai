"use client";

import { useEffect, useState, useTransition } from "react";
import { connectTelegram, getPaymentsStatus, type PaymentsStatus } from "@/app/(app)/admin/actions";
import { cn } from "@/lib/utils";

const Dot = ({ ok }: { ok: boolean | undefined }) => <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", ok ? "bg-emerald-400" : "bg-amber-400")} />;

/** Admin → Payments: whether Telegram Stars and NOWPayments are set up and working, and connecting the Telegram bot. */
export function AdminPayments() {
  const [s, setS] = useState<PaymentsStatus | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean }>();
  const [pending, start] = useTransition();
  const load = () => start(async () => setS(await getPaymentsStatus()));
  useEffect(load, []);

  const connect = () =>
    start(async () => {
      setNote(undefined);
      const r = await connectTelegram();
      setNote(r.ok ? { text: `Connected @${r.username}.`, ok: true } : { text: r.error, ok: false });
      setS(await getPaymentsStatus());
    });

  const t = s?.telegram;
  const c = s?.crypto;
  return (
    <section className="panel mt-6 flex flex-col gap-4 p-5" aria-labelledby="payments-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="payments-title" className="font-display text-lg font-bold text-neutral-50">Payments</h2>
          <p className="text-sm text-neutral-400">Each way to pay appears on the Pro and Tokens pages once its keys are added in Vercel.</p>
        </div>
        <button type="button" onClick={load} disabled={pending} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "Checking..." : "Check again"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 text-sm">
          <p className="font-semibold text-neutral-100">Telegram Stars</p>
          {!s ? (
            <p className="mt-1 text-neutral-500">Checking...</p>
          ) : !t?.configured ? (
            <p className="mt-1 flex gap-2 text-neutral-400"><Dot ok={false} /> Add TELEGRAM_BOT_TOKEN in Vercel, then redeploy.</p>
          ) : t.error ? (
            <p className="mt-1 flex gap-2 text-red-300"><Dot ok={false} /> {t.error}</p>
          ) : (
            <>
              <p className="mt-1 flex gap-2 text-neutral-300"><Dot ok={t.connected} /> @{t.username} · {t.connected ? "connected to this site" : "not connected yet"}</p>
              {t.lastError && <p className="mt-1 text-xs text-amber-300">Last error from Telegram: {t.lastError}</p>}
              <button type="button" onClick={connect} disabled={pending} className="mt-3 rounded-lg bg-gradient-to-r from-[#37aee2] to-[#1e96c8] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {t.connected ? "Reconnect bot" : "Connect Telegram bot"}
              </button>
            </>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 text-sm">
          <p className="font-semibold text-neutral-100">Crypto (NOWPayments)</p>
          {!s ? (
            <p className="mt-1 text-neutral-500">Checking...</p>
          ) : !c?.configured ? (
            <p className="mt-1 flex gap-2 text-neutral-400"><Dot ok={false} /> Add NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET in Vercel, then redeploy.</p>
          ) : c.error ? (
            <p className="mt-1 flex gap-2 text-red-300"><Dot ok={false} /> {c.error}</p>
          ) : (
            <p className="mt-1 flex gap-2 text-neutral-300">
              <Dot ok={c.ok} /> {c.ok ? "API key works" : "NOWPayments didn't answer OK"}
              {c.sandbox && <span className="rounded-full bg-amber-400/15 px-2 text-xs font-semibold text-amber-300">Sandbox: test payments only</span>}
            </p>
          )}
        </div>
      </div>
      {note && <p role="status" className={cn("text-sm", note.ok ? "text-emerald-300" : "text-red-400")}>{note.text}</p>}
    </section>
  );
}
