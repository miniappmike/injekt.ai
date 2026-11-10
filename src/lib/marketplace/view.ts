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

/* ---------- Sorting, view modes and the looping carousel ---------- */

/** Views, likes and Virality Rank for one persona (rank is only for personas still for sale). */
export interface ListingStat {
  views: number;
  likes: number;
  rank: number | null;
}
export const NO_STAT: ListingStat = { views: 0, likes: 0, rank: null };

export const SORTS = [
  { key: "trending", label: "Trending" },
  { key: "newest", label: "Newest" },
  { key: "liked", label: "Most liked" },
  { key: "price-low", label: "Price: low to high" },
  { key: "price-high", label: "Price: high to low" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];
export type ViewMode = "cards" | "grid";

/** Reads ?sort= safely: anything unknown means Trending. */
export const parseSort = (v: string | null | undefined): SortKey => SORTS.find((s) => s.key === v)?.key ?? "trending";
/** Reads ?view= safely: anything but "grid" means Cards. */
export const parseView = (v: string | null | undefined): ViewMode => (v === "grid" ? "grid" : "cards");

/**
 * The query string for a browse or persona link, leaving out anything that is the default
 * (available tab, Trending, Cards). "" when everything is default.
 */
export function marketQuery({ tab, sort, view }: { tab?: "available" | "sold"; sort?: SortKey; view?: ViewMode }): string {
  const q = new URLSearchParams();
  if (tab === "sold") q.set("tab", "sold");
  if (sort && sort !== "trending") q.set("sort", sort);
  if (view === "grid") q.set("view", "grid");
  const s = q.toString();
  return s ? `?${s}` : "";
}

const published = (l: PublicListing) => (l.publishedAt ? new Date(l.publishedAt).getTime() || 0 : 0);

/**
 * Puts the personas in the chosen order. It only reorders: nothing is ever dropped. Ties fall back to newest, then
 * name, so the order is the same on every refresh. Trending uses the Virality Rank (1 first); personas with no rank
 * (sold ones) go by views + likes.
 */
export function sortListings(listings: PublicListing[], stats: Record<string, ListingStat>, sort: SortKey): PublicListing[] {
  const st = (l: PublicListing) => stats[l.id] ?? NO_STAT;
  const score = (l: PublicListing) => st(l).views + st(l).likes;
  const byNewest = (a: PublicListing, b: PublicListing) => published(b) - published(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const primary: (a: PublicListing, b: PublicListing) => number = {
    trending: (a: PublicListing, b: PublicListing) => {
      const ra = st(a).rank;
      const rb = st(b).rank;
      if (ra !== null && rb !== null) return ra - rb;
      if (ra !== null) return -1;
      if (rb !== null) return 1;
      return score(b) - score(a);
    },
    newest: () => 0,
    liked: (a: PublicListing, b: PublicListing) => st(b).likes - st(a).likes,
    "price-low": (a: PublicListing, b: PublicListing) => a.priceCents - b.priceCents,
    "price-high": (a: PublicListing, b: PublicListing) => b.priceCents - a.priceCents,
  }[sort];
  return [...listings].sort((a, b) => primary(a, b) || byNewest(a, b));
}

/** The small badge on a grid card: SOLD, then a top-ten Virality Rank, then NEW (listed in the last 3 days). */
export function gridBadge(l: PublicListing, stat: ListingStat, now = Date.now()): { kind: "sold" | "rank" | "new"; text: string } | null {
  if (l.state === "sold") return { kind: "sold", text: "SOLD" };
  if (stat.rank !== null && stat.rank <= 10) return { kind: "rank", text: `#${stat.rank}` };
  const age = daysSince(l.publishedAt, now);
  if (age !== null && age <= 3) return { kind: "new", text: "NEW" };
  return null;
}

/* The looping carousel draws the list several times side by side and always rests in the middle copy. */

/** Only loop when there are enough personas for it to look right (one or two just sit centred). */
export const canLoop = (count: number) => count >= 3;
/** How many copies to draw: three, or five for a short list so a fast swipe can't reach an edge. */
export const loopCopies = (count: number) => (!canLoop(count) ? 1 : count >= 6 ? 3 : 5);
/** The index of the middle copy's first card; the carousel starts here. */
export const loopHome = (count: number) => (canLoop(count) ? Math.floor(loopCopies(count) / 2) * count : 0);
/** A card number (even -1 or count, for "one past the end") as a position within one copy. */
export const wrapIndex = (i: number, count: number) => (count <= 0 ? 0 : ((i % count) + count) % count);

/**
 * Which copy of a persona to scroll to: the one closest to the card now in the centre. `from` and the result are
 * positions across all copies. Asking for the persona just past the end of the list lands on the next copy's first card.
 */
export function nearestSlot(target: number, from: number, count: number): number {
  if (count <= 0) return 0;
  const base = wrapIndex(target, count);
  // Rounding half up means an exact tie (half a copy away) goes forward.
  return base + Math.floor((from - base) / count + 0.5) * count;
}

/**
 * After the scroll settles: how many cards' worth to shift by so the view is back in the middle copy.
 * 0 when it already is; otherwise a whole number of copies. The picture looks identical either side of the jump.
 */
export function loopShift(slot: number, count: number): number {
  if (!canLoop(count)) return 0;
  const copies = loopCopies(count);
  const home = Math.floor(copies / 2);
  const copy = Math.floor(slot / count);
  return (home - copy) * count;
}
