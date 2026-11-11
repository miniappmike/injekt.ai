"use server";

import { adminClient } from "@/lib/supabase/admin";
import { friendly, parseId, run, ActionError, type Result } from "@/lib/marketplace/admin-guard";
import { holdIsLive, loadListing, mustNotBeSold, revalidateListing, savePrice } from "@/lib/marketplace/listing-core";

/**
 * Admin controls on marketplace cards: delist, relist and change the price. Each action starts with the server-side
 * admin check (inside run()), so a non-admin who calls one directly is refused before any data is touched.
 */

const HOLD_MESSAGE = "Someone is checking out with this persona right now. Try again in a few minutes.";

/** Takes a live persona off the marketplace. She goes back to the admin's Characters page. Can be relisted later. */
export async function delistListing(listingId: string): Promise<Result> {
  return run(async () => {
    const id = parseId(listingId);
    const l = await loadListing(id);
    if (l.status === "sold") throw new ActionError("Sold personas belong to their buyer and can't be delisted.");
    if (holdIsLive(l)) throw new ActionError(HOLD_MESSAGE);
    if (l.status === "draft") throw new ActionError("This persona isn't on the marketplace yet, so there is nothing to delist.");
    if (l.status === "delisted") return {};
    // An expired hold (status still 'reserved') is fine: the database clears it as the status changes.
    const { error } = await adminClient().from("marketplace_listings").update({ status: "delisted" }).eq("id", id);
    if (error) throw new ActionError(friendly(error.message));
    revalidateListing(l.source_character_id);
    return {};
  }, "admin-actions");
}

/** True when the listing holds a taken snapshot: at least one stored full-size file path. */
function hasSnapshot(fullAssets: unknown): boolean {
  if (!fullAssets || typeof fullAssets !== "object") return false;
  return Object.values(fullAssets).some((v) => (Array.isArray(v) ? v.some((p) => typeof p === "string" && p) : typeof v === "string" && !!v));
}

/** Puts a delisted persona back on the marketplace with its existing snapshot and previews. */
export async function relistListing(listingId: string): Promise<Result> {
  return run(async () => {
    const id = parseId(listingId);
    const l = await loadListing(id);
    mustNotBeSold(l);
    if (l.status !== "delisted") throw new ActionError("Only delisted personas can be relisted.");
    const db = adminClient();
    const { data: imgs } = await db.from("listing_images").select("id").eq("listing_id", id).limit(1);
    if (!hasSnapshot(l.full_assets) || !imgs?.length) {
      throw new ActionError("This listing isn't ready to go live. Open the character and press Publish.");
    }
    const { error } = await db.from("marketplace_listings").update({ status: "available" }).eq("id", id);
    if (error) throw new ActionError(friendly(error.message));
    revalidateListing(l.source_character_id);
    return {};
  }, "admin-actions");
}

/** Changes the price of an unsold persona. Someone mid-checkout still pays the price they saw. */
export async function setListingPrice(listingId: string, priceCents: number): Promise<Result> {
  return run(async () => {
    await savePrice(listingId, priceCents);
    return {};
  }, "admin-actions");
}
