import type { Metadata } from "next";
import { PersonaDetail } from "@/components/marketplace/persona-detail";
import { entitlements } from "@/lib/entitlements";
import { getLikeStates } from "@/lib/marketplace/likes";
import { getListingStats } from "@/lib/marketplace/stats";
import { marketQuery, parseSort, parseView } from "@/lib/marketplace/view";
import { getPublicListing } from "@/lib/marketplace/public-data";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const l = await getPublicListing(id);
    return { title: `${l.name} · Marketplace · Model Spawn`, description: l.tagline || undefined };
  } catch {
    return { title: "Marketplace · Model Spawn" };
  }
}

export default async function PersonaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; sort?: string; view?: string }> }) {
  const [{ id }, { tab, sort, view }] = await Promise.all([params, searchParams]);
  const listing = await getPublicListing(id);
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? (await entitlements.planOf(user.id)) === "admin" : false;
  const [likeStates, stats] = await Promise.all([getLikeStates([id]), getListingStats([id])]);
  const likes = likeStates[id] ?? { likes: 0, liked: false };
  const stat = stats[id] ?? { views: 0, likes: 0, rank: null };
  const backTab = tab === "sold" || listing.state === "sold" ? "sold" : "available";
  // The back arrow returns to the same tab, sort and view the shopper came from.
  const backHref = `/marketplace${marketQuery({ tab: backTab, sort: parseSort(sort), view: parseView(view) })}`;
  return <PersonaDetail listing={listing} likes={likes} stat={stat} isAdmin={isAdmin} signedIn={!!user} backHref={backHref} />;
}
