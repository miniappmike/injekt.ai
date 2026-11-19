import { z } from "zod";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

/** Plain helpers and rules for the admin "List on marketplace" flow. No server code here, so the editor can use them too. */

export const MIN_PRICE_CENTS = 50;
export const MAX_PRICE_CENTS = 10_000_000;
export const DEFAULT_PRICE_CENTS = 2900;
export const MAX_PREVIEWS = 10;
export const MAX_PREVIEW_UPLOAD_BYTES = 15 * 1024 * 1024;

export type ListingStatus = "draft" | "available" | "reserved" | "sold" | "delisted";

/** "29.00" or "$1,299.5" -> 2900 / 129950. Returns null when it isn't a plain amount of money. */
export function dollarsToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const centsToDollars = (cents: number) => (cents / 100).toFixed(2);

export const priceCentsSchema = z
  .number()
  .int("Enter a price in dollars and cents.")
  .min(MIN_PRICE_CENTS, "The lowest price is $0.50.")
  .max(MAX_PRICE_CENTS, "The highest price is $100,000.");

export const publicProfileSchema = z.object({
  tagline: z.string().trim().max(120, "The tagline can be up to 120 characters."),
  bio: z.string().trim().max(1200, "The bio can be up to 1,200 characters."),
  tags: z.array(z.string().trim().min(1).max(24, "Each tag can be up to 24 characters.")).max(8, "Use up to 8 tags."),
  // No age: the marketplace doesn't show or ask for one. Zod drops unknown keys, so an old stored age is ignored.
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const detailsSchema = z.object({
  name: z.string().trim().min(1, "Give her a name.").max(80, "The name can be up to 80 characters."),
  priceCents: priceCentsSchema,
  publicProfile: publicProfileSchema,
});
export type ListingDetails = z.infer<typeof detailsSchema>;

/** Where a preview can be copied from on the character. */
/** Her pictures that can become previews: profile photo, both sheets and every reference photo she can have. */
export const PREVIEW_SOURCES = ["profile_photo", "face_sheet", "body_sheet", ...Array.from({ length: MAX_REFERENCE_PHOTOS }, (_, i) => `reference:${i}`)] as [string, ...string[]];
export type PreviewSource = string;

/** Why a listing can't be published yet, in plain words (empty when it can). Mirrors the server's checks. */
export function publishBlockers(x: {
  hasAssets: boolean;
  name: string;
  priceCents: number;
  previewCount: number;
}): string[] {
  const out: string[] = [];
  if (!x.hasAssets) out.push("Add a face sheet, body sheet or reference photo to this character first.");
  if (!x.name.trim()) out.push("Give her a name.");
  if (!(x.priceCents >= MIN_PRICE_CENTS)) out.push("Set a price of at least $0.50.");
  if (x.previewCount < 1) out.push("Add at least one preview picture.");
  return out;
}
