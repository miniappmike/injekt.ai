"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adjustTokens } from "@/app/(app)/admin/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Add or remove someone's tokens, with an optional note that shows in their token activity. */
export function AdminTokenAdjust({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [pending, start] = useTransition();
  const n = Math.trunc(Number(amount));
  const valid = Number.isFinite(n) && n > 0;

  const run = (sign: 1 | -1) => {
    if (!valid) return;
    if (!window.confirm(`${sign > 0 ? "Add" : "Remove"} ${n.toLocaleString()} tokens ${sign > 0 ? "to" : "from"} ${email}?`)) return;
    start(async () => {
      const r = await adjustTokens({ userId, delta: sign * n, note });
      setMsg(r.ok ? { text: `Done. Balance is now ${r.balance.toLocaleString()} tokens.`, ok: true } : { text: r.error, ok: false });
      if (r.ok) {
        setAmount("");
        setNote("");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input type="number" min={1} inputMode="numeric" placeholder="Tokens" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Number of tokens" className="w-28 tabular-nums" />
        <Input placeholder="Note (optional, e.g. refund, gift)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} aria-label="Note" className="min-w-0 flex-1" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!valid || pending} onClick={() => run(1)} className="flex-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm sm:flex-none sm:py-1.5 font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25 disabled:opacity-40">
          + Add tokens
        </button>
        <button type="button" disabled={!valid || pending} onClick={() => run(-1)} className="flex-1 rounded-lg bg-red-500/10 px-3 py-2 text-sm sm:flex-none sm:py-1.5 font-semibold text-red-300 ring-1 ring-red-400/40 hover:bg-red-500/20 disabled:opacity-40">
          − Remove tokens
        </button>
      </div>
      {msg && <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</p>}
      <p className="text-xs text-neutral-500">Added tokens never expire. Removing takes the soonest-expiring tokens first, and never more than they have.</p>
    </div>
  );
}
