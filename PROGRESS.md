# Persona Marketplace: progress and handoff

Personas are fictional adults and exclusive: each listing sells once, to exactly one owner. Anyone can buy one without
a subscription; the generation tools need the $9.99/mo subscription. The existing bring-your-own-key generation flow is
not touched.

Work happens one phase at a time, with a commit after each phase. Phase 9 (crypto) is design only until asked for.

| Phase | What | Status |
|---|---|---|
| 1 | Schema and RLS | **Done** |
| 2 | Atomic purchase function (security-critical) | **Done** |
| 3 | Admin "List" flow | Next |
| 4 | Admin controls in the marketplace | Not started |
| 5 | Marketplace UI | **Waiting for the UI target screenshot** |
| 6 | Stripe (security-critical) | Not started |
| 7 | Compliance basics | Not started |
| 8 | Tests (security-critical) | Not started |
| 9 | Crypto payments | Design only, do not build |

## Phase 1: schema and RLS (done)

Migration: `supabase/migrations/0014_marketplace.sql`. Tests: `tests/sql/marketplace.test.ts` (runs every migration in
an in-process Postgres).

### Tables

- **`marketplace_listings`**
  - Columns from the spec: `id`, `source_character_id`, `name`, `price_cents` (50¢ to $100,000), `status`
    (draft / available / reserved / sold / delisted), `reserved_by`, `reserved_until`, `sold_to`, `sold_at`,
    `published_at`, `profile_snapshot` (jsonb), `full_assets` (jsonb of storage paths).
  - Added columns:
    - `currency` (`usd`; ready for phase 9).
    - `reserved_price_cents`: the price frozen when a checkout reserves the listing, so a price edit during checkout never
      changes the charge (phase 3 rule).
    - `public_profile`: what the listing page shows, separate from the private `profile_snapshot` the buyer receives.
    - `created_at`, `updated_at`.
  - Checks: a sold row must have `sold_to` and `sold_at`. A reserved row must have who, until when, and the price.
- **`listing_images`**: `id`, `listing_id`, `storage_path` (a watermarked preview), `sort_order`.
- **`purchases`**:
  - `listing_id` is UNIQUE, so a persona has one owner ever.
  - `provider_payment_id` is UNIQUE, so a replayed webhook can't record a second purchase.
  - `provider` is any lowercase name, so another provider can be added without a schema change.
- **`characters.purchased_from_listing_id`** links a bought character to its listing. It is unique, and the owner can't
  set it themselves.

### Who can do what

- **Public (signed in or not):**
  - Reads `available` and `sold` listings, and a reservation that has run out (it's for sale again), plus their preview
    images.
  - Drafts, delisted listings and live reservations are hidden.
- **Hidden columns:**
  - `sold_to`, `reserved_by`, `source_character_id`, `reserved_price_cents`, `profile_snapshot` and `full_assets` can't be
    read through the API by anyone (column grants).
  - So the public never learns who bought a persona.
- **Full assets:**
  - Only the buyer (`sold_to`) and admins can read them, through `get_listing_assets(listing_id)`.
  - In storage, only they can read the `marketplace-assets` bucket.
- **Writes:**
  - Only admins insert, update or delete listings and listing images (RLS checks `is_admin()`).
  - Only admins upload to the marketplace buckets.
  - Nobody writes `purchases` through the API.

### Rules the database enforces (trigger `marketplace_listing_guard`)

- **No direct reserving or selling:** nobody, admins included, can set a listing to `reserved` or `sold`, or set
  `reserved_*`, `sold_to` or `sold_at`, directly. Only trusted functions can (phase 2 purchase, phase 6 reservation), by
  setting `marketplace.trusted` for their own transaction.
- **Sold is final:** a sold listing can't be changed (price, status or anything else) or deleted.
- **No delisting during checkout:** a listing with a live reservation can't be delisted. Delisting or relisting after the
  reservation runs out clears it.
- **Publish date:** publishing (`available`) stamps `published_at`.
- **Deleting:** reserved and sold listings can't be deleted. Drafts and delisted listings can.

### Storage buckets (created by the migration, both private)

Every path starts with the listing id: `<listing_id>/<file>`.

- `marketplace-previews`: watermarked, lower-resolution images, readable while the listing is public. 5 MB limit.
- `marketplace-assets`: full-resolution sheets and photos, readable by the buyer and admins only. 15 MB limit.

### Notes for later phases

- **Free-plan limit:** the free plan allows one character (trigger `characters_free_limit`). `purchase_persona` (phase 2)
  must let a bought persona through even if the buyer already has a character.
- **Realtime:** the phase 5 progress bar needs `marketplace_listings` added to the `supabase_realtime` publication.
  Because some columns are hidden from the public, check that Realtime delivers changes to anonymous visitors. If it
  doesn't, a small public counts view with polling is the fallback.

## Phase 2: atomic purchase (done)

Migration: `supabase/migrations/0015_purchase_persona.sql`. Server: `src/lib/marketplace/purchase.ts`. Tests:
`tests/sql/purchase.test.ts` (the function, against real migrations) and `tests/marketplace-purchase.test.ts` (the
server side). `tests/sql/boot.ts` sets up the test database for all marketplace SQL tests.

### `purchase_persona(listing_id, buyer_id, provider, provider_payment_id, amount_cents default null)`

The only way a listing becomes sold. It runs as one transaction, callable by the service role only.

1. **Lock:** locks the listing row `FOR UPDATE`, so payments for the same persona are handled one after the other.
2. **Idempotent on `provider_payment_id`:** the same payment again returns the first result (`already_recorded`), with the
   same purchase and character. The same payment id used for a different listing, buyer or provider raises
   `purchase_payment_id_reused`.
3. **Who can buy:** a listing can be sold if it's available, reserved by this buyer (even if the hold just ran out), or
   reserved by someone else whose hold ran out. Otherwise the result is:
   - `sold` if it's already sold.
   - `unavailable` for a draft, a delisted listing, or someone else's live hold.
   - `not_found` if there's no such listing.
4. **Price:** the price is the reserved price if this buyer holds the reservation, otherwise today's price. When
   `amount_cents` is passed and doesn't match, nothing is sold (`amount_mismatch`).
5. **Sale:** marks the listing sold and inserts the `purchases` row. It also creates the buyer's character with:
   - Name, notes, "always keep", height and weight from the snapshot.
   - The profile description from the profile build.
   - The profile photo, face sheet, body sheet and up to 3 references, each at a new path
     `<buyer>/characters/<character>/<file>`.
   - `purchased_from_listing_id` set to the listing.
6. **Free plan:** the one-character limit is skipped for this insert only. It still applies to characters the buyer makes
   themselves.
7. **Provider-agnostic:** the function contains nothing about Stripe. The caller verifies the payment first.

### Files

Files live in object storage and can't be copied inside a database transaction, so the work is split:

- **The function:** writes the copy plan onto the purchase (`purchases.asset_copies`).
- **The server:** `recordPurchase()` calls the function, then `copyPurchaseAssets()` copies each file from
  `marketplace-assets` to the buyer's folder in `character-media`, and stamps `purchases.assets_copied_at`.
- **Retries:** the plan never changes, so copying is safe to retry. A file that's already there counts as done. A failed
  copy never undoes the sale.
- **Repair:** a replayed webhook finishes any copying left undone, and so does the daily cleanup cron
  (`repairUncopiedPurchases`).
- **Safety check:** the server refuses any copy that isn't from the marketplace bucket into the buyer's own folder.

### For phase 6

- **Webhook:** verify the signature, then call `recordPurchase({ listingId, buyerId, provider: "stripe",
  providerPaymentId, amountCents })`.
- **Refunds:** if `needsRefund(outcome)` is true (`sold`, `unavailable`, `amount_mismatch`, `not_found`), refund the
  payment and show the buyer the message.
- **Reservations:** phase 6 adds the 10-minute reservation function. It must set `marketplace.trusted` the same way
  `purchase_persona` does.
- **Concurrency test:** a real two-buyers-at-once test is in phase 8. PGlite runs one connection, so it can't race. The
  container has Postgres 16, so phase 8 can run the race for real.

## Manual setup so far

Run these in the Supabase SQL editor, in order. Skip any you've already run: each one fails with "already exists" if
run twice.

1. `supabase/migrations/0012_daily_usage.sql`: daily prompt allowances (from the prompt-first pivot).
2. `supabase/migrations/0013_app_settings.sql`: admin settings for caps and the server model (from the pivot).
3. `supabase/migrations/0014_marketplace.sql`: marketplace tables, RLS, and the two storage buckets.
4. `supabase/migrations/0015_purchase_persona.sql`: the purchase function.
