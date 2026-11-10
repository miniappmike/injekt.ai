import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/** Views, likes and Virality Rank (views + likes among personas still for sale; sold ones have none). */
export interface ListingStats {
  views: number;
  likes: number;
  rank: number | null;
}

/** Stats for these personas (or every public one). Missing personas get zeros; never throws. */
export async function getListingStats(listingIds?: string[]): Promise<Record<string, ListingStats>> {
  const out: Record<string, ListingStats> = Object.fromEntries((listingIds ?? []).map((id) => [id, { views: 0, likes: 0, rank: null }]));
  try {
    const { data, error } = await adminClient().rpc("listing_stats", { p_listings: listingIds ?? null });
    if (error) throw error;
    for (const r of (data ?? []) as { listing_id: string; views: number; likes: number; rank: number | null }[]) {
      out[r.listing_id] = { views: r.views, likes: r.likes, rank: r.rank };
    }
  } catch (e) {
    // Before migration 0018 (or on an error) the page shows zeros instead of failing.
    console.warn("[marketplace] stats unavailable", e instanceof Error ? e.message : e);
  }
  return out;
}
