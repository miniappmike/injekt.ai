import type { Metadata } from "next";
import { MarketBrowser } from "@/components/marketplace/market-browser";
import { entitlements } from "@/lib/entitlements";
import { getLikeStates } from "@/lib/marketplace/likes";
import { listPublicListings, marketplaceCounts } from "@/lib/marketplace/public-data";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Marketplace · Model Spawn" };

// Signed-in and signed-out visitors see different things (admin controls, their own hearts), so never cache this page.
export const dynamic = "force-dynamic";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [listings, counts, isAdmin] = await Promise.all([
    listPublicListings(),
    marketplaceCounts(),
    user ? entitlements.planOf(user.id).then((p) => p === "admin") : false,
  ]);
  const likes = await getLikeStates(listings.map((l) => l.id));
  return <MarketBrowser listings={listings} counts={counts} likes={likes} isAdmin={isAdmin} initialTab={tab === "sold" ? "sold" : "available"} />;
}
