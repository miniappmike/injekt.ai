import Link from "next/link";
import { PRO } from "@/lib/plans";
import { ProGem } from "@/components/pro-badge";

/**
 * The Pro pass never renews by itself, so this reminds them: from PRO.remindDays before it ends until a week after.
 * Shown under the header on every signed-in page.
 */
/** Whether the reminder is due: from PRO.remindDays before the end until a week after. */
export function bannerWindow(proUntil: string | null): boolean {
  if (!proUntil) return false;
  const ms = Date.parse(proUntil) - Date.now();
  return ms <= PRO.remindDays * 86_400_000 && ms >= -7 * 86_400_000;
}

export function RenewBanner({ proUntil, manualPro, autoRenews = false }: { proUntil: string | null; manualPro: boolean; autoRenews?: boolean }) {
  if (!proUntil || manualPro) return null;
  const ms = Date.parse(proUntil) - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (!bannerWindow(proUntil)) return null;
  const ended = ms <= 0;
  // Paid with Telegram Stars: it renews by itself, so there's nothing to remind them of until it actually ends.
  if (autoRenews && !ended) return null;
  return (
    <div role="status" className="border-b border-[#f92776]/30 bg-gradient-to-r from-[#2a0b18] via-neutral-950 to-[#2a0b18]">
      <div className="mx-auto flex max-w-6xl 2xl:max-w-[88rem] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 text-neutral-200">
          <ProGem className="h-5 w-5" glow={false} />
          {ended ? "Your Pro has ended: your own keys are paused and daily limits are back." : `Your Pro ends in ${days} day${days === 1 ? "" : "s"}. It doesn't renew by itself.`}
        </span>
        <Link href="/upgrade" className="rounded-full bg-gradient-to-r from-[#ff5fa2] to-[#f92776] px-3.5 py-1 text-xs font-semibold text-white transition hover:brightness-110">
          Renew Pro
        </Link>
      </div>
    </div>
  );
}
