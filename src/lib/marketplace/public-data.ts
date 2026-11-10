import "server-only";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import type { MarketCounts, PublicListing } from "./view";

// Only these columns may be read by the public (the database refuses any other), so they are named out loud.
const COLUMNS = "id, name, price_cents, currency, status, reserved_until, published_at, sold_at, public_profile";

type Row = {
  id: string;
  name: string;
  price_cents: number;
  status: PublicListing["status"];
  reserved_until: string | null;
  published_at: string | null;
  sold_at: string | null;
  public_profile: { tagline?: string; bio?: string; tags?: string[] } | null;
};

const SIGNED_FOR_SECONDS = 3600;

/** A persona is on show when it's for sale, sold, or its checkout hold has run out (so it's for sale again). */
function toPublic(r: Row, images: PublicListing["images"]): PublicListing | null {
  const lapsed = r.status === "reserved" && !!r.reserved_until && new Date(r.reserved_until).getTime() <= Date.now();
  const state = r.status === "sold" ? "sold" : r.status === "available" || lapsed ? "available" : null;
  if (!state) return null;
  const p = r.public_profile ?? {};
  return {
    id: r.id,
    name: r.name,
    priceCents: r.price_cents,
    status: r.status,
    state,
    holdActive: r.status === "reserved" && !lapsed,
    publishedAt: r.published_at,
    soldAt: r.sold_at,
    tagline: typeof p.tagline === "string" ? p.tagline : "",
    bio: typeof p.bio === "string" ? p.bio : "",
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [],
    images,
  };
}

/**
 * Preview pictures for some listings, in order, with links that work for an hour. The rows come through RLS (so only
 * public listings' pictures), and the service role only signs paths we already got that way.
 */
async function imagesFor(ids: string[]): Promise<Map<string, PublicListing["images"]>> {
  const out = new Map<string, PublicListing["images"]>();
  if (!ids.length) return out;
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("listing_images")
    .select("id, listing_id, storage_path, sort_order")
    .in("listing_id", ids)
    .order("sort_order");
  const rows = data ?? [];
  if (!rows.length) return out;
  const { data: signed } = await adminClient()
    .storage.from("marketplace-previews")
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_FOR_SECONDS);
  const urlByPath = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  for (const r of rows) {
    const url = urlByPath.get(r.storage_path);
    if (!url) continue;
    const list = out.get(r.listing_id) ?? [];
    list.push({ id: r.id, url });
    out.set(r.listing_id, list);
  }
  return out;
}

/** Everything on the shelf: available first (newest first), then sold (most recently sold first). */
export async function listPublicListings(): Promise<PublicListing[]> {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("marketplace_listings")
    .select(COLUMNS)
    .in("status", ["available", "sold", "reserved"])
    .order("published_at", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as Row[];
  const images = await imagesFor(rows.map((r) => r.id));
  const list = rows.flatMap((r) => {
    const l = toPublic(r, images.get(r.id) ?? []);
    return l ? [l] : [];
  });
  const time = (l: PublicListing) => new Date((l.state === "sold" ? l.soldAt : l.publishedAt) ?? 0).getTime();
  return list.sort((a, b) => (a.state === b.state ? time(b) - time(a) : a.state === "available" ? -1 : 1));
}

/** One persona by id, or the 404 page when it isn't visible to the public (draft, delisted, held, or not real). */
export async function getPublicListing(id: string): Promise<PublicListing> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase.from("marketplace_listings").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const images = await imagesFor([id]);
  const listing = toPublic(data as Row, images.get(id) ?? []);
  if (!listing) notFound();
  return listing;
}

/** How many are available and sold, straight from the database function (exact, even for signed-out visitors). */
export async function marketplaceCounts(): Promise<MarketCounts> {
  const supabase = await createUserClient();
  const { data } = await supabase.rpc("marketplace_counts");
  const row = Array.isArray(data) ? data[0] : data;
  return { available: Number(row?.available ?? 0), sold: Number(row?.sold ?? 0) };
}
