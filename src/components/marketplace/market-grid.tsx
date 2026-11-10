"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AdminListingControls } from "@/components/admin-listing-controls";
import { FlameIcon, LockIcon, SparkIcon } from "@/components/icons";
import { HeartButton } from "@/components/marketplace/heart-button";
import { formatPrice, gridBadge, type ListingStat, type PublicListing } from "@/lib/marketplace/view";

/**
 * The dense "agency" grid: tall portrait cards, the cover photo filling each one. Badge top-left (rank, NEW or SOLD),
 * heart top-right, name and price along the bottom. The whole card is one link to her page; the heart sits above that
 * link and the admin controls sit under the card, so neither opens it.
 */
export function MarketGrid({
  listings,
  likes,
  stats,
  isAdmin,
  hrefFor,
}: {
  listings: PublicListing[];
  likes: Record<string, { likes: number; liked: boolean }>;
  stats: Record<string, ListingStat>;
  isAdmin: boolean;
  hrefFor: (l: PublicListing) => string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 min-[1440px]:grid-cols-5!">
      {listings.map((l, i) => (
        <li key={l.id} className="animate-fade-up min-w-0" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
          <GridCard listing={l} likes={likes[l.id] ?? { likes: 0, liked: false }} stat={stats[l.id] ?? { views: 0, likes: 0, rank: null }} isAdmin={isAdmin} href={hrefFor(l)} eager={i < 5} />
        </li>
      ))}
    </ul>
  );
}

function GridCard({
  listing,
  likes,
  stat,
  isAdmin,
  href,
  eager,
}: {
  listing: PublicListing;
  likes: { likes: number; liked: boolean };
  stat: ListingStat;
  isAdmin: boolean;
  href: string;
  eager: boolean;
}) {
  const sold = listing.state === "sold";
  const badge = gridBadge(listing, stat);
  const photos = listing.images;
  // Hovering with a mouse flips slowly through her pictures. The extra pictures are only added to the page on the
  // first hover, so a big grid still loads just the covers.
  const [hovering, setHovering] = useState(false);
  const [everHovered, setEverHovered] = useState(false);
  const [shot, setShot] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!hovering || photos.length < 2) return;
    timer.current = setInterval(() => setShot((s) => (s + 1) % photos.length), 1100);
    return () => {
      clearInterval(timer.current);
      setShot(0);
    };
  }, [hovering, photos.length]);

  return (
    <div>
      <article
        aria-label={listing.name}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          setHovering(true);
          setEverHovered(true);
        }}
        onPointerLeave={() => setHovering(false)}
        className="group relative aspect-[3/5.2] overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {photos.map((p, i) =>
          i === 0 || everHovered ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage link
            <img
              key={p.id}
              src={p.url}
              alt=""
              loading={i === 0 && eager ? "eager" : "lazy"}
              draggable={false}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                sold && "saturate-[0.55]",
                i === shot ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null,
        )}

        {/* Dark fades so the white text reads on any picture. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

        {/* The whole card is this link; the heart below sits above it. */}
        <Link href={href} aria-label={`Open ${listing.name}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80" />

        {badge && (
          <span
            className={cn(
              "pointer-events-none absolute top-2.5 left-2.5 z-20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-poster text-[15px] leading-none tracking-wider shadow-md",
              badge.kind === "sold" ? "bg-neutral-950/85 text-neutral-100 ring-1 ring-white/15" : "bg-white text-neutral-950",
            )}
          >
            {badge.kind === "rank" ? <FlameIcon className="h-3.5 w-3.5 text-brand-600" /> : badge.kind === "new" ? <SparkIcon className="h-3.5 w-3.5 text-brand-600" /> : <LockIcon className="h-3.5 w-3.5" />}
            {badge.text}
          </span>
        )}
        <div className="absolute top-1.5 right-1.5 z-20">
          <HeartButton listingId={listing.id} name={listing.name} initialLikes={likes.likes} initialLiked={likes.liked} variant="overlay" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-3">
          <h2 className="min-w-0 font-display text-base leading-tight font-bold text-white [text-wrap:balance] sm:text-lg">
            <span className="line-clamp-2 break-words">{listing.name}</span>
          </h2>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-md", sold ? "bg-neutral-700" : "bg-brand-600")}>
            {sold ? "Sold" : formatPrice(listing.priceCents)}
          </span>
        </div>
      </article>
      {isAdmin && (
        <div className="mt-2 flex justify-center">
          <AdminListingControls listingId={listing.id} status={listing.status} priceCents={listing.priceCents} holdActive={listing.holdActive} name={listing.name} compact />
        </div>
      )}
    </div>
  );
}
