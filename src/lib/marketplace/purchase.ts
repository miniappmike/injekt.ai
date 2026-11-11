import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";

/**
 * The server side of a persona purchase. The payment provider's webhook verifies the payment first, then calls
 * recordPurchase() with the provider's name and payment id. Nothing here knows which provider it was.
 */

export type PurchaseOutcome = "purchased" | "already_recorded" | "sold" | "unavailable" | "amount_mismatch" | "not_found";

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  purchaseId: string | null;
  characterId: string | null;
  /** The price the listing should have been paid at (also given for amount_mismatch). */
  amountCents: number | null;
  /** Whether the full-resolution files are in the buyer's folder yet (copying is retried until they are). */
  assetsCopied: boolean;
}

const input = z.object({
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  provider: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  providerPaymentId: z.string().min(1).max(255),
  /** What the provider says was paid; the sale only goes through if it matches the price. */
  amountCents: z.number().int().nonnegative().nullable().optional(),
});
export type PurchaseInput = z.infer<typeof input>;

/** True for outcomes where the payment must go back to the buyer (they paid, but the persona wasn't theirs to have). */
export const needsRefund = (o: PurchaseOutcome) => o === "sold" || o === "unavailable" || o === "amount_mismatch" || o === "not_found";

/**
 * Sells the persona in one database transaction (purchase_persona), then copies its files into the buyer's folder.
 * Safe to call again with the same payment: it reports the first result and finishes any copying left undone.
 */
export async function recordPurchase(raw: PurchaseInput): Promise<PurchaseResult> {
  const p = input.parse(raw);
  const { data, error } = await adminClient().rpc("purchase_persona", {
    p_listing: p.listingId,
    p_buyer: p.buyerId,
    p_provider: p.provider,
    p_payment_id: p.providerPaymentId,
    p_amount_cents: p.amountCents ?? null,
  });
  if (error) throw new Error(`purchase_persona failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: PurchaseOutcome; purchase_id: string | null; character_id: string | null; amount_cents: number | null } | undefined;
  if (!row) throw new Error("purchase_persona returned nothing");

  let assetsCopied = false;
  if (row.purchase_id && (row.outcome === "purchased" || row.outcome === "already_recorded")) {
    // A failed copy doesn't undo the sale: it's recorded, and the copy is retried on the next call or by the repair.
    try {
      assetsCopied = await copyPurchaseAssets(row.purchase_id);
    } catch (e) {
      console.error(`[marketplace] copying files for purchase ${row.purchase_id} failed; will retry`, e);
    }
  }
  return { outcome: row.outcome, purchaseId: row.purchase_id, characterId: row.character_id, amountCents: row.amount_cents, assetsCopied };
}

interface CopyJob {
  from_bucket: string;
  from: string;
  to_bucket: string;
  to: string;
}
const ALLOWED_FROM = new Set(["marketplace-assets"]);
const ALLOWED_TO = new Set(["character-media"]);

/**
 * Copies a purchase's files from the listing's private folder to the paths purchase_persona chose in the buyer's folder,
 * then stamps assets_copied_at. The plan never changes, so this can run any number of times: a file already copied
 * counts as done.
 */
export async function copyPurchaseAssets(purchaseId: string): Promise<boolean> {
  const db = adminClient();
  const { data, error } = await db.from("purchases").select("id, buyer_id, asset_copies, assets_copied_at").eq("id", purchaseId).maybeSingle();
  if (error || !data) throw new Error(`purchase ${purchaseId} not found`);
  if (data.assets_copied_at) return true;

  const jobs = (Array.isArray(data.asset_copies) ? data.asset_copies : []) as CopyJob[];
  for (const job of jobs) {
    // Defence in depth: only ever copy marketplace files into this buyer's own folder.
    if (!ALLOWED_FROM.has(job.from_bucket) || !ALLOWED_TO.has(job.to_bucket) || !job.to.startsWith(`${data.buyer_id}/`)) {
      throw new Error(`purchase ${purchaseId} has a copy outside the buyer's folder`);
    }
    const { error: copyError } = await db.storage.from(job.from_bucket).copy(job.from, job.to, { destinationBucket: job.to_bucket });
    if (copyError && !/already exists|duplicate/i.test(copyError.message)) {
      throw new Error(`copy ${job.from} → ${job.to}: ${copyError.message}`);
    }
  }
  const { error: stampError } = await db.from("purchases").update({ assets_copied_at: new Date().toISOString() }).eq("id", purchaseId).is("assets_copied_at", null);
  if (stampError) throw new Error(`stamping purchase ${purchaseId}: ${stampError.message}`);
  return true;
}

/** Finishes copying for every purchase whose files didn't all arrive (run from the cleanup cron). */
export async function repairUncopiedPurchases(limit = 20): Promise<{ repaired: number; failed: number }> {
  const { data } = await adminClient().from("purchases").select("id").is("assets_copied_at", null).order("created_at").limit(limit);
  let repaired = 0;
  let failed = 0;
  for (const p of data ?? []) {
    try {
      if (await copyPurchaseAssets(p.id as string)) repaired++;
    } catch (e) {
      failed++;
      console.error(`[marketplace] repair of purchase ${p.id} failed`, e);
    }
  }
  return { repaired, failed };
}
