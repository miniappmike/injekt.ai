"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { BackIcon } from "@/components/icons";
import { AdminListingControls } from "@/components/admin-listing-controls";
import { Bio } from "@/components/marketplace/bio";
import { ListingSlideshow } from "@/components/marketplace/listing-slideshow";
import { PersonaActions } from "@/components/marketplace/persona-actions";
import { StatCards, type Stat } from "@/components/marketplace/stat-cards";
import { daysSince, formatPrice, type PublicListing } from "@/lib/marketplace/view";

const YOU_GET = [
  "Full-size face and body sheets",
  "Her reference photos",
  "Her full written profile",
  "Yours alone: she's never sold again",
];

/** The persona page: hero pictures, poster name, actions, bio, rolling stat cards and what you get. Plain props only. */
export function PersonaDetail({
  listing,
  likes,
  isAdmin,
  signedIn,
  tab = "available",
}: {
  listing: PublicListing;
  likes: { likes: number; liked: boolean };
  isAdmin: boolean;
  signedIn: boolean;
  tab?: "available" | "sold";
}) {
  const sold = listing.state === "sold";
  const age = daysSince(listing.publishedAt);
  const stats: Stat[] = [
    { label: "Price", value: listing.priceCents % 100 === 0 ? listing.priceCents / 100 : formatPrice(listing.priceCents).slice(1), prefix: "$", unit: "once" },
    { label: "Preview photos", value: listing.images.length, unit: listing.images.length === 1 ? "photo" : "photos" },
    { label: "Owners", value: 1, unit: "exclusive" },
    sold ? { label: "Status", value: "Sold" } : age === null ? { label: "Listed", value: "New" } : age === 0 ? { label: "Listed", value: "Today" } : { label: "Listed", value: age, unit: age === 1 ? "day ago" : "days ago" },
  ];

  return (
    <div className="animate-fade-in">
      <Link
        href={`/marketplace?tab=${tab}`}
        aria-label="Back to the marketplace"
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition-all hover:border-neutral-500 hover:bg-neutral-800 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 max-sm:hidden"
      >
        <BackIcon />
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        {/* Hero pictures floating over a faint orbit ring. */}
        <div className="relative overflow-x-clip lg:sticky lg:top-24 lg:self-start">
          <Link
            href={`/marketplace?tab=${tab}`}
            aria-label="Back to the marketplace"
            className="absolute top-2 left-0 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg backdrop-blur transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:hidden"
          >
            <BackIcon />
          </Link>
          <div className="relative mx-auto w-full max-w-[22rem] pt-2 pb-10 sm:max-w-[26rem] lg:max-w-[30rem]">
            <svg viewBox="0 0 400 520" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-[1.22] overflow-visible">
              <ellipse cx="200" cy="270" rx="215" ry="105" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" transform="rotate(-14 200 270)" />
              <ellipse cx="200" cy="270" rx="178" ry="84" fill="none" stroke="rgb(232 38 94)" strokeOpacity="0.22" strokeWidth="1" transform="rotate(-14 200 270)" />
            </svg>
            <ViewTransition name={`persona-img-${listing.id}`} share="persona-morph" default="none">
              <div className={`relative aspect-[3/4.2] overflow-hidden rounded-[2rem] shadow-[0_40px_70px_-20px_rgb(0_0_0/0.95)] ring-1 ring-white/10 ${sold ? "saturate-[0.6]" : ""}`}>
                <ListingSlideshow images={listing.images} name={listing.name} variant="hero" eager />
              </div>
            </ViewTransition>
          </div>
        </div>

        <div className="min-w-0 space-y-6 lg:pt-6">
          <div className="text-center lg:text-left">
            <ViewTransition name={`persona-name-${listing.id}`} share="persona-morph" default="none">
              <h1 className="font-poster text-[4.6rem] leading-[0.85] tracking-wide text-white uppercase [text-wrap:balance] sm:text-[6rem] lg:text-[7.5rem]">{listing.name}</h1>
            </ViewTransition>
            {listing.tagline && <p className="mt-3 text-base text-neutral-300">{listing.tagline}</p>}
            {listing.tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start" aria-label="Tags">
                {listing.tags.map((t) => (
                  <li key={t} className="rounded-full border border-neutral-700 bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-neutral-200">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <PersonaActions listing={listing} signedIn={signedIn} likes={likes} />

          {listing.bio && <Bio text={listing.bio} />}

          <StatCards stats={stats} />

          <section className="panel p-5" aria-labelledby="you-get">
            <h2 id="you-get" className="font-display text-base font-bold text-neutral-50">
              What you get
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-neutral-300">
              {YOU_GET.map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-brand-400" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {isAdmin && (
            <section className="panel p-5" aria-label="Admin controls">
              <p className="mb-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Admin</p>
              <AdminListingControls listingId={listing.id} status={listing.status} priceCents={listing.priceCents} holdActive={listing.holdActive} name={listing.name} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
