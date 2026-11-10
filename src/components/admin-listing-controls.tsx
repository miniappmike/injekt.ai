"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { delistListing, relistListing, setListingPrice } from "@/app/(app)/marketplace/admin-actions";
import { centsToDollars, dollarsToCents, type ListingStatus } from "@/lib/marketplace/listing-input";

/**
 * Admin-only controls for one listing: change the price, delist, relist. Only render this for admins; the server
 * actions re-check the caller anyway, so a hidden button is never the protection.
 * `compact` makes small pill buttons that fit on or under a marketplace card.
 */
export function AdminListingControls({
  listingId,
  status,
  priceCents,
  holdActive,
  name,
  compact = false,
  showPrice = true,
}: {
  listingId: string;
  status: ListingStatus;
  priceCents: number;
  holdActive: boolean;
  /** Used in the delist confirmation. */
  name?: string;
  compact?: boolean;
  /** The character page already has a full price field, so it turns the inline editor off. */
  showPrice?: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(!compact);
  const [draft, setDraft] = useState(centsToDollars(priceCents));

  if (status === "sold") {
    return <span className="inline-flex w-fit self-start rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-semibold text-neutral-300 ring-1 ring-neutral-700">Sold</span>;
  }

  function act(fn: () => Promise<{ ok: boolean }>, after?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError((r as unknown as { error: string }).error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const cents = dollarsToCents(draft);
  const unchanged = cents === priceCents;
  function savePrice() {
    if (cents === null) return setError("Enter the price in dollars, like 29.00.");
    if (unchanged) return cancelEdit();
    act(() => setListingPrice(listingId, cents), () => compact && setEditing(false));
  }
  function cancelEdit() {
    setDraft(centsToDollars(priceCents));
    setError(undefined);
    if (compact) setEditing(false);
  }
  function delist() {
    if (!window.confirm(`Delist ${name || "this persona"}? She'll leave the marketplace and come back to your Characters page.`)) return;
    act(() => delistListing(listingId));
  }

  // Delisting is blocked in the database while someone is mid-checkout, so say why instead of failing later.
  const delistBlocked = holdActive;
  const btn = compact ? "h-8 rounded-full px-3 text-xs" : "h-11";
  const live = status === "available" || status === "reserved";

  return (
    <div className={compact ? "grid gap-1.5 text-xs" : "grid gap-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {showPrice &&
          (editing ? (
            <>
              <div className={`relative ${compact ? "w-24" : "w-36"}`}>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">$</span>
                <Input
                  aria-label="Price in dollars"
                  inputMode="decimal"
                  autoFocus={compact}
                  value={draft}
                  disabled={busy}
                  className={`${compact ? "h-8 pl-6 text-xs" : "h-11 pl-7"}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      savePrice();
                    } else if (e.key === "Escape") cancelEdit();
                  }}
                />
              </div>
              <Button type="button" size="sm" variant="secondary" className={btn} disabled={busy || cents === null || unchanged} onClick={savePrice}>
                {busy ? "Saving..." : "Save"}
              </Button>
              {compact && (
                <Button type="button" size="sm" variant="ghost" className={btn} disabled={busy} onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <button
              type="button"
              aria-label="Edit price"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-950/70 px-3 text-xs font-semibold text-neutral-100 ring-1 ring-white/10 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              onClick={() => setEditing(true)}
            >
              ${centsToDollars(priceCents)}
              <svg aria-hidden viewBox="0 0 20 20" className="h-3 w-3 fill-current text-neutral-400"><path d="M13.6 2.6a1.9 1.9 0 0 1 2.7 2.7l-9 9-3.6.9.9-3.6 9-9Z" /></svg>
            </button>
          ))}

        {live && (
          <Button type="button" size="sm" variant="outline" className={btn} disabled={busy || delistBlocked} onClick={delist}>
            Delist
          </Button>
        )}
        {status === "delisted" && (
          <Button type="button" size="sm" variant="secondary" className={btn} disabled={busy} onClick={() => act(() => relistListing(listingId))}>
            {busy ? "Working..." : "Relist"}
          </Button>
        )}
      </div>
      {live && delistBlocked && <p className="text-amber-300">Checkout in progress. You can delist once it finishes.</p>}
      {holdActive && showPrice && editing && <p className="text-neutral-400">Whoever is checking out keeps the price they saw.</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
  );
}
