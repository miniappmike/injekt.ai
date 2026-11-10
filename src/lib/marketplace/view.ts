/** Plain helpers and types for the public marketplace screens. No server code here, so client components can use them. */

import type { ListingStatus } from "./listing-input";

/** One persona as the public sees it. Only the columns anyone may read, plus signed preview image links. */
export interface PublicListing {
  id: string;
  name: string;
  priceCents: number;
  /** The raw database status. A reservation whose hold ran out is still "reserved" here; use `state` for display. */
  status: ListingStatus;
  /** What the shopper sees: still for sale, or gone. */
  state: "available" | "sold";
  /** True while someone's checkout hold is running (the public never sees these, but admins might). */
  holdActive: boolean;
  publishedAt: string | null;
  soldAt: string | null;
  tagline: string;
  bio: string;
  tags: string[];
  images: { id: string; url: string }[];
}

export interface MarketCounts {
  available: number;
  sold: number;
}

/** 2900 -> "$29", 2950 -> "$29.50", 129900 -> "$1,299". */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Whole days between a date and now (never negative). */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** "Today", "Yesterday", "5 days ago". */
export function listedAgo(iso: string | null, now = Date.now()): string {
  const d = daysSince(iso, now);
  if (d === null) return "";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

/** Share of the shelf that has sold, 0 to 1. An empty shelf is 0, not NaN. */
export function soldShare({ available, sold }: MarketCounts): number {
  const total = available + sold;
  return total > 0 ? sold / total : 0;
}

/**
 * How a coverflow card looks given its distance from the centre, measured in card widths (0 = centred, 1 = the
 * next card over). Smooth and symmetric, so a half-finished swipe sits half-way between the two looks.
 */
export function coverflowLook(distance: number): { scale: number; opacity: number; dim: number } {
  const d = Math.min(Math.abs(distance), 2);
  return {
    scale: 1 - 0.16 * Math.min(d, 1.5),
    opacity: Math.max(0.4, 1 - 0.38 * d),
    // How much of a dark veil sits over the card (0 = none).
    dim: Math.min(0.62, 0.42 * d),
  };
}

/** Which card is closest to the centre, given the scroll position and the distance between card centres. */
export function nearestIndex(scrollLeft: number, pitch: number, count: number): number {
  if (count <= 0 || pitch <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / pitch)));
}

/**
 * Where a slideshow goes after a swipe or arrow press. `edge` is -1 or 1 when the move ran off either end, so the
 * caller can hand the gesture to the outer carousel; otherwise 0.
 */
export function slideStep(index: number, dir: -1 | 1, length: number): { index: number; edge: -1 | 0 | 1 } {
  const next = index + dir;
  if (next < 0) return { index: 0, edge: -1 };
  if (next > length - 1) return { index: Math.max(0, length - 1), edge: 1 };
  return { index: next, edge: 0 };
}

/** The digits of a whole number, for the rolling counter. */
export const digitsOf = (n: number) => String(Math.max(0, Math.floor(n))).split("").map(Number);
