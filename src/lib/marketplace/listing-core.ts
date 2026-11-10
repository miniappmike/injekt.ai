import "server-only";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { ActionError, firstIssue, friendly, parseId } from "./admin-guard";
import { priceCentsSchema } from "./listing-input";

/** Listing lookups and changes shared by the character-page actions and the marketplace admin actions. Callers must have passed requireAdmin() first. */

export interface ListingRow {
  id: string;
  name: string;
  price_cents: number;
  status: string;
  reserved_until: string | null;
  source_character_id: string;
  full_assets: unknown;
}
const LISTING_COLUMNS = "id, name, price_cents, status, reserved_until, source_character_id, full_assets";

export async function loadListing(listingId: string): Promise<ListingRow> {
  const { data } = await adminClient().from("marketplace_listings").select(LISTING_COLUMNS).eq("id", listingId).maybeSingle();
  if (!data) throw new ActionError("That listing couldn't be found.");
  return data as ListingRow;
}

/** A sold persona belongs to its buyer: nothing about it changes. */
export function mustNotBeSold(l: ListingRow) {
  if (l.status === "sold") throw new ActionError("This persona is sold, so it can't be changed.");
}

/** True while someone's checkout hold is still running (an expired hold doesn't count). */
export function holdIsLive(l: ListingRow) {
  return l.status === "reserved" && !!l.reserved_until && new Date(l.reserved_until).getTime() > Date.now();
}

/** Refreshes every page that shows this listing: the public grid, the admin characters grid and the character page. */
export function revalidateListing(characterId: string) {
  revalidatePath("/marketplace");
  revalidatePath("/characters");
  revalidatePath(`/characters/${characterId}`);
}

/** Validates and saves a new price. Someone mid-checkout keeps the price they saw (the database holds it for them). */
export async function savePrice(listingId: unknown, priceCents: unknown): Promise<void> {
  const id = parseId(listingId);
  const price = priceCentsSchema.safeParse(priceCents);
  if (!price.success) throw new ActionError(firstIssue(price.error));
  const l = await loadListing(id);
  mustNotBeSold(l);
  const { error } = await adminClient().from("marketplace_listings").update({ price_cents: price.data }).eq("id", id);
  if (error) throw new ActionError(friendly(error.message));
  revalidateListing(l.source_character_id);
}
