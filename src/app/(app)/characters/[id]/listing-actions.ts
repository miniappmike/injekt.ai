"use server";

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";
import { adminClient } from "@/lib/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/images";
import { makePreview } from "@/lib/marketplace/watermark";
import {
  DEFAULT_PRICE_CENTS,
  MAX_PREVIEWS,
  MAX_PREVIEW_UPLOAD_BYTES,
  PREVIEW_SOURCES,
  detailsSchema,
  priceCentsSchema,
} from "@/lib/marketplace/listing-input";

/**
 * The admin "List on marketplace" actions. Listing columns like profile_snapshot and full_assets are hidden from every
 * API user (even admins), so these use the service-role client, but only AFTER requireAdmin() has checked, on the
 * server, that the caller is an admin. Hiding the buttons is never the protection.
 */

const PREVIEW_BUCKET = "marketplace-previews";
const ASSET_BUCKET = "marketplace-assets";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// A message that is safe and useful to show the admin. Anything else becomes a generic message.
class ActionError extends Error {}

async function requireAdmin() {
  const { user } = await requireUser();
  if ((await entitlements.planOf(user.id)) !== "admin") throw new ActionError("Admins only.");
  return user;
}

async function run<T extends object>(fn: (adminId: string) => Promise<T>): Promise<Result<T>> {
  try {
    const user = await requireAdmin();
    return { ok: true, ...(await fn(user.id)) };
  } catch (e) {
    // requireUser() redirects by throwing; let that through.
    if (e instanceof Error && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[listing-actions]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const idSchema = z.string().uuid();
const parseId = (v: unknown) => {
  const r = idSchema.safeParse(v);
  if (!r.success) throw new ActionError("That item couldn't be found.");
  return r.data;
};
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

/** The database's own rule messages, in plain English. */
function friendly(message: string | undefined): string {
  const m = message ?? "";
  if (/listing_sold/.test(m)) return "This persona is sold, so it can't be changed.";
  if (/listing_reserved/.test(m)) return "Someone is checking out with this persona right now. Try again in a few minutes.";
  if (/price/.test(m)) return "That price isn't allowed. Use $0.50 to $100,000.";
  return "Couldn't save that. Try again.";
}

interface ListingRow {
  id: string;
  name: string;
  price_cents: number;
  status: string;
  reserved_until: string | null;
  source_character_id: string;
  public_profile: { age?: number } | null;
}
const LISTING_COLUMNS = "id, name, price_cents, status, reserved_until, source_character_id, public_profile";

async function loadListing(listingId: string): Promise<ListingRow> {
  const { data } = await adminClient().from("marketplace_listings").select(LISTING_COLUMNS).eq("id", listingId).maybeSingle();
  if (!data) throw new ActionError("That listing couldn't be found.");
  return data as ListingRow;
}

/** A sold persona belongs to its buyer: nothing about it changes. */
function mustNotBeSold(l: ListingRow) {
  if (l.status === "sold") throw new ActionError("This persona is sold, so it can't be changed.");
}

function revalidate(characterId: string) {
  revalidatePath(`/characters/${characterId}`);
  revalidatePath("/characters");
}

interface SourceCharacter {
  id: string;
  name: string;
  always_keep: string | null;
  height: string | null;
  weight: string | null;
  lore: string | null;
  profile: unknown;
  profile_photo_path: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[] | null;
}
const CHARACTER_COLUMNS = "id, name, always_keep, height, weight, lore, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths";

/** The character must exist and belong to this admin. */
async function loadOwnCharacter(characterId: string, adminId: string): Promise<SourceCharacter> {
  const { data } = await adminClient().from("characters").select(CHARACTER_COLUMNS).eq("id", characterId).eq("user_id", adminId).maybeSingle();
  if (!data) throw new ActionError("That character couldn't be found.");
  return data as SourceCharacter;
}

/** Opens this character's listing, or starts a draft. One live listing per character; a sold character is never listed again. */
export async function getOrCreateDraft(characterId: string): Promise<Result<{ listingId: string }>> {
  return run(async (adminId) => {
    const id = parseId(characterId);
    const c = await loadOwnCharacter(id, adminId);
    const db = adminClient();
    const { data: sold } = await db.from("marketplace_listings").select("id").eq("source_character_id", id).eq("status", "sold").limit(1);
    if (sold?.length) throw new ActionError("This persona is already sold.");
    const { data: existing } = await db
      .from("marketplace_listings")
      .select("id")
      .eq("source_character_id", id)
      .in("status", ["draft", "available", "reserved", "delisted"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing?.length) return { listingId: (existing[0] as { id: string }).id };
    const { data, error } = await db
      .from("marketplace_listings")
      .insert({ source_character_id: id, name: c.name, price_cents: DEFAULT_PRICE_CENTS, status: "draft" })
      .select("id")
      .single();
    if (error || !data) throw new ActionError("Couldn't start the listing. Try again.");
    revalidate(id);
    return { listingId: (data as { id: string }).id };
  });
}

/** Saves the name, price and the public profile together. */
export async function updateListingDetails(
  listingId: string,
  details: { name: string; priceCents: number; publicProfile: { tagline: string; bio: string; tags: string[]; age: number } },
): Promise<Result> {
  return run(async () => {
    const id = parseId(listingId);
    const parsed = detailsSchema.safeParse(details);
    if (!parsed.success) throw new ActionError(firstIssue(parsed.error));
    const l = await loadListing(id);
    mustNotBeSold(l);
    const { error } = await adminClient()
      .from("marketplace_listings")
      .update({ name: parsed.data.name, price_cents: parsed.data.priceCents, public_profile: parsed.data.publicProfile })
      .eq("id", id);
    if (error) throw new ActionError(friendly(error.message));
    revalidate(l.source_character_id);
    return {};
  });
}

/** Saves just the price. Someone mid-checkout keeps the price they saw (the database holds it for them). */
export async function updateListingPrice(listingId: string, priceCents: number): Promise<Result> {
  return run(async () => {
    const id = parseId(listingId);
    const price = priceCentsSchema.safeParse(priceCents);
    if (!price.success) throw new ActionError(firstIssue(price.error));
    const l = await loadListing(id);
    mustNotBeSold(l);
    const { error } = await adminClient().from("marketplace_listings").update({ price_cents: price.data }).eq("id", id);
    if (error) throw new ActionError(friendly(error.message));
    revalidate(l.source_character_id);
    return {};
  });
}

/** Watermarks a picture, stores it and adds it to the listing. */
async function addPreview(l: ListingRow, bytes: Buffer): Promise<{ imageId: string }> {
  mustNotBeSold(l);
  const db = adminClient();
  const { data: rows } = await db.from("listing_images").select("sort_order").eq("listing_id", l.id);
  const existing = (rows ?? []) as { sort_order: number }[];
  if (existing.length >= MAX_PREVIEWS) throw new ActionError(`A listing can have up to ${MAX_PREVIEWS} preview pictures.`);
  let preview;
  try {
    preview = await makePreview(bytes);
  } catch {
    throw new ActionError("That image couldn't be used. Use a JPEG, PNG or WebP picture.");
  }
  const path = `${l.id}/${randomUUID()}.jpg`;
  const { error: upErr } = await db.storage.from(PREVIEW_BUCKET).upload(path, preview.data, { contentType: "image/jpeg" });
  if (upErr) throw new ActionError("Couldn't upload the preview. Try again.");
  const sortOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const { data, error } = await db.from("listing_images").insert({ listing_id: l.id, storage_path: path, sort_order: sortOrder }).select("id").single();
  if (error || !data) {
    await db.storage.from(PREVIEW_BUCKET).remove([path]);
    throw new ActionError("Couldn't save the preview. Try again.");
  }
  revalidate(l.source_character_id);
  return { imageId: (data as { id: string }).id };
}

const sourceSchema = z.enum(PREVIEW_SOURCES);

/** Adds one of the character's own pictures as a (watermarked, shrunk) preview. */
export async function addPreviewFromCharacter(listingId: string, which: string): Promise<Result<{ imageId: string }>> {
  return run(async (adminId) => {
    const id = parseId(listingId);
    const src = sourceSchema.safeParse(which);
    if (!src.success) throw new ActionError("Pick one of her pictures.");
    const l = await loadListing(id);
    const c = await loadOwnCharacter(l.source_character_id, adminId);
    const w = src.data;
    const path = w.startsWith("reference:")
      ? (c.reference_paths ?? [])[Number(w.split(":")[1])]
      : w === "profile_photo" ? c.profile_photo_path : w === "face_sheet" ? c.face_sheet_path : c.body_sheet_path;
    if (!path) throw new ActionError("She doesn't have that picture yet.");
    const { data, error } = await adminClient().storage.from(MEDIA_BUCKET).download(path);
    if (error || !data) throw new ActionError("Couldn't read that picture. Try again.");
    return addPreview(l, Buffer.from(await data.arrayBuffer()));
  });
}

/** Adds an uploaded picture as a (watermarked, shrunk) preview. */
export async function addPreviewUpload(listingId: string, formData: FormData): Promise<Result<{ imageId: string }>> {
  return run(async () => {
    const id = parseId(listingId);
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ActionError("Choose a picture to upload.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ActionError("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_PREVIEW_UPLOAD_BYTES) throw new ActionError("That image is over 15 MB.");
    const l = await loadListing(id);
    return addPreview(l, Buffer.from(await file.arrayBuffer()));
  });
}

export async function removePreview(imageId: string): Promise<Result> {
  return run(async () => {
    const id = parseId(imageId);
    const db = adminClient();
    const { data: img } = await db.from("listing_images").select("id, listing_id, storage_path").eq("id", id).maybeSingle();
    if (!img) throw new ActionError("That picture was already removed.");
    const row = img as { id: string; listing_id: string; storage_path: string };
    const l = await loadListing(row.listing_id);
    mustNotBeSold(l);
    const { error } = await db.from("listing_images").delete().eq("id", id);
    if (error) throw new ActionError("Couldn't remove that picture. Try again.");
    // The row is the source of truth; a leftover file is harmless.
    await db.storage.from(PREVIEW_BUCKET).remove([row.storage_path]);
    revalidate(l.source_character_id);
    return {};
  });
}

/** Saves a new picture order. The list must be exactly this listing's pictures. */
export async function reorderPreviews(listingId: string, orderedImageIds: string[]): Promise<Result> {
  return run(async () => {
    const id = parseId(listingId);
    const ids = z.array(z.string().uuid()).max(MAX_PREVIEWS).safeParse(orderedImageIds);
    if (!ids.success) throw new ActionError("Couldn't read the new order.");
    const l = await loadListing(id);
    mustNotBeSold(l);
    const db = adminClient();
    const { data } = await db.from("listing_images").select("id").eq("listing_id", id);
    const own = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    const given = new Set(ids.data);
    if (given.size !== ids.data.length || given.size !== own.size || ids.data.some((x) => !own.has(x))) {
      throw new ActionError("The pictures changed. Refresh the page and try again.");
    }
    for (const [i, imageId] of ids.data.entries()) {
      const { error } = await db.from("listing_images").update({ sort_order: i }).eq("id", imageId).eq("listing_id", id);
      if (error) throw new ActionError("Couldn't save the new order. Try again.");
    }
    revalidate(l.source_character_id);
    return {};
  });
}

/**
 * Puts the persona on the marketplace. This is the moment the private snapshot is taken: the character's full-size
 * files are copied into the locked-down assets bucket and the profile text is frozen, so later edits to the character
 * never change what a buyer receives. Publishing again (Update listing) takes a fresh snapshot.
 */
export async function publishListing(listingId: string): Promise<Result> {
  return run(async (adminId) => {
    const id = parseId(listingId);
    const l = await loadListing(id);
    mustNotBeSold(l);
    if (l.status === "reserved" && l.reserved_until && new Date(l.reserved_until).getTime() > Date.now()) {
      throw new ActionError("Someone is checking out with this persona right now. Try again in a few minutes.");
    }
    const c = await loadOwnCharacter(l.source_character_id, adminId);
    const age = l.public_profile?.age;
    if (!l.name.trim()) throw new ActionError("Give her a name first.");
    if (!(l.price_cents >= 50)) throw new ActionError("Set a price first.");
    if (!age || age < 18) throw new ActionError("Add her age (18 or older) and save first.");
    const refs = (c.reference_paths ?? []).filter(Boolean);
    if (!c.face_sheet_path && !c.body_sheet_path && !refs.length) {
      throw new ActionError("Add a face sheet, body sheet or reference photo to this character before listing her.");
    }
    const db = adminClient();
    const { data: imgs } = await db.from("listing_images").select("id").eq("listing_id", id).limit(1);
    if (!imgs?.length) throw new ActionError("Add at least one preview picture first.");

    // Copy each file across buckets. Any older copy is removed first so a re-publish always holds the current picture.
    const copy = async (from: string | null, kind: string): Promise<string | null> => {
      if (!from) return null;
      const to = `${id}/${kind}${extname(from) || ".jpg"}`;
      await db.storage.from(ASSET_BUCKET).remove([to]);
      const { error } = await db.storage.from(MEDIA_BUCKET).copy(from, to, { destinationBucket: ASSET_BUCKET });
      if (error && !/already exists|duplicate/i.test(error.message)) throw new ActionError("Couldn't copy her full-size pictures. Try again.");
      return to;
    };
    const fullAssets = {
      face_sheet: await copy(c.face_sheet_path, "face_sheet"),
      body_sheet: await copy(c.body_sheet_path, "body_sheet"),
      profile_photo: await copy(c.profile_photo_path, "profile_photo"),
      references: (await Promise.all(refs.slice(0, 3).map((p, i) => copy(p, `reference_${i}`)))).filter((p): p is string => !!p),
    };
    const snapshot = { lore: c.lore, always_keep: c.always_keep, height: c.height, weight: c.weight, profile: c.profile ?? {} };
    const { error } = await db
      .from("marketplace_listings")
      .update({ full_assets: fullAssets, profile_snapshot: snapshot, status: "available" })
      .eq("id", id);
    if (error) throw new ActionError(friendly(error.message));
    revalidate(l.source_character_id);
    return {};
  });
}
