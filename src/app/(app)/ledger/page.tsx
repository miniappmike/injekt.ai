import { LedgerView } from "@/components/ledger-view";
import { requireUser } from "@/lib/auth";

export default async function LedgerPage() {
  await requireUser();
  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Ledger</h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-neutral-400">Every AI call you make with your own keys, what it cost, and what you&apos;ve spent on each API platform. Updates live.</p>
      <LedgerView />
    </div>
  );
}
