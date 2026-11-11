import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { ListingStatus } from "./listing-input";

/** What the admin's listing editor needs for one character. Only call after checking the caller is an admin. */
export interface EditorListing {
  id: string;
  name: string;
  priceCents: number;
  status: ListingStatus;
  /** True while someone's checkout hold is still running. */
  holdActive: boolean;
  publicProfile: { tagline?: string; bio?: string; tags?: string[] };
  previews: { id: string; url: string }[];
}

export async function loadEditorListing(characterId: string): Promise<EditorListing | null> {
  const db = adminClient();
  const { data } = await db
    .from("marketplace_listings")
    .select("id, name, price_cents, status, reserved_until, public_profile")
    .eq("source_character_id", characterId)
    .order("created_at", { ascending: false })
    .limit(1);
  const l = data?.[0];
  if (!l) return null;
  const { data: imgs } = await db.from("listing_images").select("id, storage_path").eq("listing_id", l.id).order("sort_order");
  const rows = imgs ?? [];
  const { data: signed } = rows.length
    ? await db.storage.from("marketplace-previews").createSignedUrls(rows.map((r) => r.storage_path), 3600)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    id: l.id,
    name: l.name,
    priceCents: l.price_cents,
    status: l.status,
    holdActive: l.status === "reserved" && !!l.reserved_until && new Date(l.reserved_until).getTime() > Date.now(),
    publicProfile: (l.public_profile ?? {}) as EditorListing["publicProfile"],
    previews: rows.flatMap((r) => (urlByPath.get(r.storage_path) ? [{ id: r.id, url: urlByPath.get(r.storage_path)! }] : [])),
  };
}
