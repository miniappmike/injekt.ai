"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, ViewTransition } from "react";
import { cn } from "@/lib/utils";
import { AdminListingControls } from "@/components/admin-listing-controls";
import { HeartButton } from "@/components/marketplace/heart-button";
import { ListingSlideshow } from "@/components/marketplace/listing-slideshow";
import { formatPrice, listedAgo, type PublicListing } from "@/lib/marketplace/view";

/** The card's width on screen; the carousel uses the same value to centre cards. */
export const CARD_WIDTH = "w-[var(--card-w)]";
/** Sets --card-w for the carousel: about 72% of a phone screen, and on a computer as big as the screen's height allows (340 to 420px). */
export const CARD_VARS = "[--card-w:min(72vw,320px)] sm:[--card-w:clamp(340px,calc((100svh-420px)/1.4667),420px)]";

/**
 * One persona on the shelf. The text sits ON the picture: a small header row at the top (round photo, name, listing
 * age, price and heart) and the big poster-style name at the bottom-left, with a dark fade so it always reads.
 * Tapping the picture or the name opens her page.
 */
export function MarketCard({
  listing,
  likes,
  isAdmin,
  onEdge,
  index,
  href,
  primary = true,
}: {
  listing: PublicListing;
  likes: { likes: number; liked: boolean };
  isAdmin: boolean;
  /** A swipe past the first or last picture: move the carousel to the next card. */
  onEdge: (dir: -1 | 1) => void;
  index: number;
  /** Where the card opens (the persona page, remembering the tab, sort and view). */
  href: string;
  /** False for the repeated copies the looping carousel draws: only one copy may own the page-transition names. */
  primary?: boolean;
}) {
  const router = useRouter();
  // The page-transition names must be unique on the page, so the repeated copies go without them.
  const Vt = primary ? ViewTransition : Fragment;
  const vt = (name: string) => (primary ? { name, share: "persona-morph", default: "none" as const } : {});
  const sold = listing.state === "sold";
  const cover = listing.images[0]?.url;
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}>
      <article
        className={cn("group relative aspect-[3/4.4] overflow-hidden rounded-[2rem] bg-neutral-900 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.95)] ring-1 ring-white/10", CARD_WIDTH)}
        aria-label={listing.name}
      >
        <Vt {...vt(`persona-img-${listing.id}`)}>
          <div className={cn("absolute inset-0", sold && "saturate-[0.55]")}>
            <ListingSlideshow images={listing.images} name={listing.name} onEdge={onEdge} onTap={() => router.push(href)} eager={primary && index < 3} />
          </div>
        </Vt>

        {/* Dark fades so the white text reads on any picture. They let taps through to the slideshow. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

        {/* Header row: avatar, name and meta on the left, heart on the right. */}
        <div className="pointer-events-none absolute inset-x-0 top-7 z-10 flex items-center gap-2.5 px-4">
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-800 ring-2 ring-white/70">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage link
              <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            )}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-white">{listing.name}</span>
            <span className="block truncate text-[11px] text-white/70">
              {sold ? "Sold" : formatPrice(listing.priceCents)}
              {!sold && listing.publishedAt ? ` · ${listedAgo(listing.publishedAt)}` : ""}
            </span>
          </span>
          <HeartButton className="pointer-events-auto relative z-20" listingId={listing.id} name={listing.name} initialLikes={likes.likes} initialLiked={likes.liked} variant="overlay" />
        </div>

        {sold && (
          <div className="pointer-events-none absolute right-[-3.4rem] bottom-[3.2rem] z-10 w-44 -rotate-45 bg-brand-600 py-1 text-center text-[11px] font-bold tracking-[0.3em] text-white uppercase shadow-lg">
            Sold
          </div>
        )}

        {/* Bottom-left: the poster name, her one-line tagline and up to three tags. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-5 pb-6">
          <Vt {...vt(`persona-name-${listing.id}`)}>
            <h2 className="font-poster text-[3.4rem] leading-[0.88] tracking-wide text-white uppercase [text-wrap:balance] sm:text-[4.2rem]">
              <Link href={href} className="pointer-events-auto break-words rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                {listing.name}
              </Link>
            </h2>
          </Vt>
          {listing.tagline && <p className="mt-2 line-clamp-2 text-sm leading-snug text-white/80">{listing.tagline}</p>}
          {listing.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
              {listing.tags.slice(0, 3).map((t) => (
                <li key={t} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
      {isAdmin && (
        <div className="mt-3 flex justify-center">
          <AdminListingControls listingId={listing.id} status={listing.status} priceCents={listing.priceCents} holdActive={listing.holdActive} name={listing.name} compact />
        </div>
      )}
    </div>
  );
}
