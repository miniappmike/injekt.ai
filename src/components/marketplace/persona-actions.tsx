"use client";

import { useEffect, useState } from "react";
import { BookmarkIcon, ShareIcon } from "@/components/icons";
import { BuyButton } from "@/components/marketplace/buy-button";
import { HeartButton } from "@/components/marketplace/heart-button";
import { useToast } from "@/components/toast";
import { formatPrice, type PublicListing } from "@/lib/marketplace/view";

const SAVED_KEY = "ms.savedPersonas";

function readSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const roundBtn =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-100 transition-all hover:border-neutral-500 hover:bg-neutral-800 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";

/** Buy pill with round Heart, Share and Save buttons beside it. Save is kept in this browser only. */
export function PersonaActions({
  listing,
  signedIn,
  likes,
}: {
  listing: PublicListing;
  signedIn: boolean;
  likes: { likes: number; liked: boolean };
}) {
  const { toast, show } = useToast();
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(readSaved().includes(listing.id)), [listing.id]);

  function toggleSave() {
    const now = readSaved();
    const next = now.includes(listing.id) ? now.filter((x) => x !== listing.id) : [...now, listing.id];
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the button still reflects this visit.
    }
    const isSaved = next.includes(listing.id);
    setSaved(isSaved);
    show(isSaved ? "Saved on this device." : "Removed from saved.");
  }

  async function share() {
    const url = window.location.href.split("?")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: `${listing.name} on ModelSpawn`, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      show("Link copied.");
    } catch {
      show("Copy the address from your browser's bar.");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <BuyButton
            listingId={listing.id}
            sold={listing.state === "sold"}
            signedIn={signedIn}
            label={`Buy for ${formatPrice(listing.priceCents)}`}
            onBuy={() => show("Checkout is being set up.")}
          />
        </div>
        <HeartButton listingId={listing.id} name={listing.name} initialLikes={likes.likes} initialLiked={likes.liked} variant="solid" className="!h-12 !min-w-12" />
        <button type="button" onClick={share} aria-label={`Share ${listing.name}`} className={roundBtn}>
          <ShareIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? `Remove ${listing.name} from saved` : `Save ${listing.name}`} className={roundBtn}>
          <BookmarkIcon className="h-5 w-5" filled={saved} />
        </button>
      </div>
      {toast}
    </>
  );
}
