import { LedgerView } from "@/components/ledger-view";
import { requireUser } from "@/lib/auth";
import { settlePendingLedger } from "@/lib/ledger-sweep";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

export default async function LedgerPage() {
  const { user } = await requireUser();
  // Their calls still showing an estimate get SpicyAPI's final charge before the page shows them.
  await settlePendingLedger(adminClient(), { userId: user.id, limit: 60, budgetMs: 5000 }).catch(() => null);
  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Ledger</h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-neutral-400">Every AI call you make with your own keys, what it cost, and what you&apos;ve spent on each API platform. Updates live.</p>
      <LedgerView />
    </div>
  );
}
