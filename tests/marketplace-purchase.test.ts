import { beforeEach, describe, expect, it, vi } from "vitest";

// The server side of a purchase: calling purchase_persona, then copying the files to the buyer's folder (retryable).
const BUYER = "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b";
const LISTING = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  purchase: null as Record<string, unknown> | null,
  copies: [] as { from: string; to: string; bucket: string; dest?: string }[],
  copyError: null as null | ((to: string) => { message: string } | null),
  stamped: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    rpc: h.rpc,
    from: (table: string) => {
      if (table !== "purchases") throw new Error(table);
      return {
        select: () => {
          const chain = {
            eq: () => ({ maybeSingle: async () => ({ data: h.purchase, error: null }) }),
            is: () => ({ order: () => ({ limit: async () => ({ data: h.purchase && !h.purchase.assets_copied_at ? [{ id: h.purchase.id }] : [] }) }) }),
          };
          return chain;
        },
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            is: async () => {
              h.stamped++;
              Object.assign(h.purchase!, patch);
              return { error: null };
            },
          }),
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        copy: async (from: string, to: string, opts?: { destinationBucket?: string }) => {
          h.copies.push({ from, to, bucket, dest: opts?.destinationBucket });
          return { error: h.copyError?.(to) ?? null };
        },
      }),
    },
  }),
}));

import { copyPurchaseAssets, needsRefund, recordPurchase, repairUncopiedPurchases } from "@/lib/marketplace/purchase";

const jobs = [
  { from_bucket: "marketplace-assets", from: `${LISTING}/face.png`, to_bucket: "character-media", to: `${BUYER}/characters/c1/face-sheet.png` },
  { from_bucket: "marketplace-assets", from: `${LISTING}/r1.jpg`, to_bucket: "character-media", to: `${BUYER}/characters/c1/reference-1.jpg` },
];
const input = { listingId: LISTING, buyerId: BUYER, provider: "stripe", providerPaymentId: "cs_1", amountCents: 2500 };

beforeEach(() => {
  vi.clearAllMocks();
  h.copies.length = 0;
  h.copyError = null;
  h.stamped = 0;
  h.purchase = { id: "p1", buyer_id: BUYER, asset_copies: jobs, assets_copied_at: null };
  h.rpc.mockResolvedValue({ data: [{ outcome: "purchased", purchase_id: "p1", character_id: "c1", amount_cents: 2500 }], error: null });
});

describe("recordPurchase", () => {
  it("calls purchase_persona with the provider's details, then copies every file into the buyer's folder", async () => {
    const r = await recordPurchase(input);
    expect(h.rpc).toHaveBeenCalledWith("purchase_persona", { p_listing: LISTING, p_buyer: BUYER, p_provider: "stripe", p_payment_id: "cs_1", p_amount_cents: 2500 });
    expect(r).toEqual({ outcome: "purchased", purchaseId: "p1", characterId: "c1", amountCents: 2500, assetsCopied: true });
    expect(h.copies).toEqual(jobs.map((j) => ({ from: j.from, to: j.to, bucket: "marketplace-assets", dest: "character-media" })));
    expect(h.purchase!.assets_copied_at).toBeTruthy();
  });

  it("a replayed payment copies nothing again once the files are there", async () => {
    await recordPurchase(input);
    h.rpc.mockResolvedValue({ data: [{ outcome: "already_recorded", purchase_id: "p1", character_id: "c1", amount_cents: 2500 }], error: null });
    const again = await recordPurchase(input);
    expect(again).toMatchObject({ outcome: "already_recorded", assetsCopied: true });
    expect(h.copies).toHaveLength(2);
    expect(h.stamped).toBe(1);
  });

  it("a failed copy keeps the sale, reports the files as not copied yet, and a retry finishes it", async () => {
    h.copyError = (to) => (to.endsWith("reference-1.jpg") ? { message: "network down" } : null);
    const r = await recordPurchase(input);
    expect(r).toMatchObject({ outcome: "purchased", assetsCopied: false });
    expect(h.purchase!.assets_copied_at).toBeNull();

    // The first file is already there now; storage says so, which counts as done.
    h.copyError = (to) => (to.endsWith("face-sheet.png") ? { message: "The resource already exists" } : null);
    expect(await repairUncopiedPurchases()).toEqual({ repaired: 1, failed: 0 });
    expect(h.purchase!.assets_copied_at).toBeTruthy();
  });

  it("outcomes that mean the buyer paid for nothing are flagged for a refund, and nothing is copied", async () => {
    for (const outcome of ["sold", "unavailable", "amount_mismatch", "not_found"] as const) {
      h.rpc.mockResolvedValue({ data: [{ outcome, purchase_id: null, character_id: null, amount_cents: 2500 }], error: null });
      const r = await recordPurchase(input);
      expect(r.outcome).toBe(outcome);
      expect(needsRefund(r.outcome)).toBe(true);
    }
    expect(h.copies).toHaveLength(0);
    expect(needsRefund("purchased")).toBe(false);
    expect(needsRefund("already_recorded")).toBe(false);
  });

  it("rejects bad input before touching the database, and surfaces database errors", async () => {
    await expect(recordPurchase({ ...input, listingId: "nope" })).rejects.toThrow();
    await expect(recordPurchase({ ...input, provider: "Stripe!" })).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: null, error: { message: "purchase_payment_id_reused" } });
    await expect(recordPurchase(input)).rejects.toThrow(/purchase_payment_id_reused/);
  });
});

describe("copyPurchaseAssets", () => {
  it("never copies outside the marketplace bucket or into anyone else's folder", async () => {
    h.purchase!.asset_copies = [{ ...jobs[0], to: "someone-else/characters/c1/face.png" }];
    await expect(copyPurchaseAssets("p1")).rejects.toThrow(/outside the buyer's folder/);
    h.purchase!.asset_copies = [{ ...jobs[0], from_bucket: "character-media" }];
    await expect(copyPurchaseAssets("p1")).rejects.toThrow(/outside the buyer's folder/);
    expect(h.copies).toHaveLength(0);
  });
});
