import type { Metadata } from "next";
import { PersonaDetail } from "@/components/marketplace/persona-detail";
import { entitlements } from "@/lib/entitlements";
import { getLikeStates } from "@/lib/marketplace/likes";
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

export default async function PersonaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const listing = await getPublicListing(id);
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? (await entitlements.planOf(user.id)) === "admin" : false;
  const likes = (await getLikeStates([id]))[id] ?? { likes: 0, liked: false };
  return <PersonaDetail listing={listing} likes={likes} isAdmin={isAdmin} signedIn={!!user} tab={tab === "sold" || listing.state === "sold" ? "sold" : "available"} />;
}
