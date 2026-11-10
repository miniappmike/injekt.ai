"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The big white "Buy" pill. Phase 6 connects checkout here: replace the body of `onBuy` (or the `onNotice` call in the
 * page) with the call that starts the payment. Signed-out visitors go to log in first and come back to this page.
 */
export function BuyButton({
  listingId,
  label,
  sold,
  signedIn,
  onBuy,
}: {
  listingId: string;
  label: string;
  sold: boolean;
  signedIn: boolean;
  onBuy: () => void;
}) {
  const pill =
    "flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[15px] font-bold text-neutral-950 shadow-[0_10px_30px_-10px_rgb(255_255_255/0.45)] transition-all hover:bg-neutral-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";
  if (sold) {
    return (
      <button type="button" disabled className={cn(pill, "pointer-events-none bg-neutral-800 text-neutral-400 shadow-none")}>
        Sold
      </button>
    );
  }
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/marketplace/${listingId}`)}`} className={pill}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onBuy} className={pill}>
      {label}
    </button>
  );
}
