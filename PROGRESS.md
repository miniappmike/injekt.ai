# Persona Marketplace: progress and handoff

Personas are fictional adults and exclusive: each listing sells once, to exactly one owner. Anyone can buy one without
a subscription; the generation tools need the $9.99/mo subscription. The existing bring-your-own-key generation flow is
not touched.

Work happens one phase at a time, with a commit after each phase. Phase 9 (crypto) is design only until asked for.

| Phase | What | Status |
|---|---|---|
| 1 | Schema and RLS | **Done** |
| 2 | Atomic purchase function (security-critical) | **Done** |
| 3 | Admin "List" flow | **Done** |
| 4 | Admin controls in the marketplace | **Done** |
| 5 | Marketplace UI | **Done** |
| 6 | Stripe (security-critical) | **Next** |
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
- **Realtime (resolved in phase 5):** the listings table is *not* broadcast; a public `marketplace_pulse` row with just
  the two counts is (see phase 5). Original note: because some columns are hidden from the public, check that Realtime delivers changes to anonymous visitors. If it
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

## Phase 3: admin "List" flow (done)

No new migration. Tests: `tests/marketplace-watermark.test.ts`, `tests/marketplace-listing-actions.test.ts`.

### What it does

On an admin's `/characters/[id]` page, a full-width **Marketplace** panel (above the two-column layout, itself split into details on the left and previews on the right on wide screens; admins only,
checked on the server) lets them price a persona, write the public profile, pick preview pictures and publish.

### Files

- `src/app/(app)/characters/[id]/listing-actions.ts`: server actions. Each starts with `requireAdmin()` (plan must be
  `admin`), validates with zod, then uses `adminClient()` because the hidden listing columns can't be read by anyone
  through the API. Actions: `getOrCreateDraft`, `updateListingDetails`, `updateListingPrice`, `addPreviewFromCharacter`,
  `addPreviewUpload`, `removePreview`, `reorderPreviews`, `publishListing`. They return `{ ok: true }` or
  `{ ok: false, error }` with plain-English errors.
- `src/lib/marketplace/watermark.ts`: `makePreview(buffer)`. Applies rotation, strips metadata, fits inside 768px (never
  enlarges), tiles a diagonal "MODEL SPAWN · PREVIEW" watermark over the whole picture plus a "PREVIEW ONLY" corner badge,
  JPEG quality 72.
- `src/lib/marketplace/listing-input.ts`: shared rules (price limits, dollars to cents, public profile schema, "fill from
  her profile", publish blockers). No server code, so the editor uses it too.
- `src/lib/marketplace/admin-data.ts`: `loadEditorListing()` reads the listing, its previews and 1-hour signed preview URLs.
- `src/components/listing-editor.tsx`: the panel (status pill, price, profile builder with tag chips, preview grid with
  cover label, remove and earlier/later buttons, "add from her images", upload/drop/paste, publish).
- `src/app/(app)/characters/page.tsx`: for admins, characters whose listing is available, reserved or sold are hidden from
  the grid. The free-plan limit still counts every character.
- `next.config.ts`: server action body limit raised from 2 MB to 16 MB so a 15 MB preview upload fits.

### Rules

- **One listing per character.** `getOrCreateDraft` reuses the latest draft, live, reserved or delisted listing. A
  character whose listing sold is never listed again.
- **Sold is read-only.** Every action refuses a sold listing (the database refuses too).
- **Price.** Stored in cents, $0.50 to $100,000. Edits apply at once; a reserved listing keeps its reserved price (database).
- **No age field.** The owner decided the marketplace profile neither shows nor asks for an age ("all personas are clearly
  over 18"), so `public_profile` is just tagline, bio and tags (any age already stored is ignored). Tagline up to 120, bio up to 1,200, up to 8 tags of up to 24 characters.
- **Previews.** Up to 10 per listing, all watermarked and shrunk, stored at `marketplace-previews/<listing>/<uuid>.jpg`.
  Reordering needs exactly the listing's own picture ids.
- **Publish needs** a name, price, one preview, and a character with a face sheet, body sheet or reference photo.
  It refuses sold listings and live reservations (an expired hold is fine). It copies each file to
  `marketplace-assets/<listing>/<kind>.<ext>` (removing any older copy first), then writes `full_assets`,
  `profile_snapshot` and `status = available` in one update. Publishing again re-snapshots.

### Notes for later phases

- Phase 4 (delist): clear the hidden-from-grid rule by setting the listing to `delisted`; the `/characters` filter only
  hides available, reserved and sold listings. The editor already shows the Delisted status and lets the admin publish again.
- Re-publishing doesn't delete asset files from a reference that was since removed; they're unreferenced and harmless.

## Phase 4: admin controls in the marketplace (done)

No new migration. Tests: `tests/marketplace-admin-actions.test.ts` (Phase 3 tests updated for the age removal).

### What it does

Admins can delist a live persona, relist a delisted one and change a price inline. The controls are one reusable
component; Phase 5 puts it on each marketplace card. The server actions are the real protection.

### Files

- `src/lib/marketplace/admin-guard.ts` (server-only): `requireAdmin`, `run()`, `ActionError`, `parseId`, `friendly`, `Result`.
  Moved out of `listing-actions.ts` because "use server" files may only export async functions.
- `src/lib/marketplace/listing-core.ts` (server-only): `loadListing`, `mustNotBeSold`, `holdIsLive`, `savePrice`,
  `revalidateListing` (revalidates `/marketplace`, `/characters` and the character page). Shared by both action files.
- `src/app/(app)/marketplace/admin-actions.ts`: `delistListing`, `relistListing`, `setListingPrice`.
- `src/components/admin-listing-controls.tsx`: `<AdminListingControls listingId status priceCents holdActive name? compact? showPrice? />`.
- `src/components/listing-editor.tsx`: Delist / Relist next to the status pill (the full price field stays, so `showPrice={false}`).
- `src/app/(app)/characters/[id]/listing-actions.ts`: now uses the shared helpers; no age.

### Rules

- **Delist** sets `status = delisted`. Refused for sold ("belong to their buyer"), a live reservation (an expired hold is
  fine; the database clears it), and drafts. Delisting an already-delisted persona is a harmless success.
- **Relist** works only from `delisted` and needs a taken snapshot (`full_assets` with at least one path) and at least one
  preview; otherwise it tells the admin to open the character and press Publish. It does not re-snapshot.
- **Price** uses the same rules as Phase 3 (unsold only, $0.50 to $100,000, reserved keeps its reserved price).
- A delisted persona reappears on the admin's `/characters` grid, because that filter hides only available, reserved and
  sold listings. (No page test: it is a server component; the rule is the one `.in("status", [...])` list.)

### Notes for Phase 5

- Render `<AdminListingControls compact ... />` on each card only when the viewer is an admin (pass `name`).
- The public grid query should show only `available` and `sold`; delisted listings vanish automatically through RLS.
- `compact` shows a price pill (pencil) that turns into an input (Enter saves, Esc cancels) plus small Delist / Relist pills.

## Phase 5: marketplace UI (done)

Migration: `supabase/migrations/0016_marketplace_realtime.sql` (hearts use the separate `0017_listing_likes.sql`).
Tests: the `marketplace_counts()` block in `tests/sql/marketplace.test.ts`, and `tests/marketplace-view.test.ts` (price text,
listing age, sold share, the coverflow size/fade maths, nearest card, slideshow steps, odometer digits).

### What it does

`/marketplace` (browse) and `/marketplace/[id]` (a persona) are public: signed-out visitors can look around. Buying
needs an account (signed-out visitors are sent to log in and brought back). Phone look follows the owner's reference
screenshots: round "story" bubbles, a coverflow of tall cards with the text on the picture, a floating dock; the persona
page has a hero carousel over a faint orbit ring, a poster-style name, pill chips, a white Buy pill with round buttons,
a two-line bio with an inline "View more" and staggered stat cards whose numbers roll in like an odometer.

### Files

- `src/app/(public)/layout.tsx`: signed in = the normal `AppHeader` + phone dock (+ `AppProvider`, tray, viewer); signed out =
  small header with Log in / Sign up. Never redirects. `/marketplace` is in `PUBLIC_PREFIXES` in `src/proxy.ts`.
- `src/app/(public)/marketplace/page.tsx` and `[id]/page.tsx`: load data, then render plain-prop components.
- `src/lib/marketplace/public-data.ts` (server-only): `listPublicListings()` (public columns only; available first, then sold;
  images in order with 1-hour signed URLs), `getPublicListing(id)` (`notFound()` when not visible), `marketplaceCounts()`.
- `src/lib/marketplace/view.ts`: types and pure helpers (price text, listing age, coverflow look, slideshow step).
- `src/components/marketplace/`: `market-browser` (title, tabs, stories, coverflow), `market-progress` (live bar),
  `coverflow`, `market-card`, `listing-slideshow`, `persona-detail`, `persona-actions` (Buy, heart, share, save),
  `buy-button`, `bio`, `stat-cards`, `odometer`, plus the existing `heart-button`.
- Marketplace added to `MainNav` and the phone `MobileDock` (items made a little narrower so six fit on 360px), a
  storefront icon and a few others in `icons.tsx`. Bebas Neue added to the Google Fonts link; `--font-poster` token in `globals.css`.
- `0016`: creates `marketplace_pulse` (one public row: available and sold counts, kept current by a statement trigger on
  listing inserts, deletes and status changes) and adds only that table to the `supabase_realtime` publication. The
  listings table stays out of the live feed on purpose, so the buyer, snapshot and file paths can never travel on it.
  It also adds `marketplace_counts()` (security definer, fixed search path, returns two numbers only, executable by anon and authenticated).

### Behaviour notes

- **Live progress.** Subscribes to Realtime updates of `marketplace_pulse` and also polls `marketplace_counts()` every 30 seconds (and when the tab
  becomes visible again); when the numbers change it refreshes the lists so a sold persona moves tabs.
- **Coverflow.** CSS scroll-snap; every scroll frame sets each card's scale, fade and a dark veil from its distance to the centre
  (`requestAnimationFrame`, transform and opacity only). Arrow buttons and the arrow keys on desktop.
- **Slideshow.** Only the current, previous and next pictures exist in the page; swipes use pointer events with `touch-action: pan-y`;
  swiping past either end moves the carousel one card. A listing with one picture lets the page scroll normally.
- **Hearts.** A heart with the count sits in each card's top row and in the persona page's action row.
- **Save** is stored in `localStorage` under `ms.savedPersonas` (this browser only).
- **Buy** is a placeholder (toast "Checkout is being set up."). Phase 6 connects checkout in `buy-button.tsx` / `persona-actions.tsx`.
- **Transitions.** `<ViewTransition>` wraps the card picture and name and the persona page's hero and name (shared names per
  listing id). This Next version has no `experimental.viewTransition` setting, so the morph only runs where React starts the
  navigation inside a transition; the page also fades in with a CSS animation as the fallback. Reduced-motion is respected.
- Admins see compact controls under each card and full controls on the persona page. Delisted listings are not shown on the browse page
  (relist from the character page).

### Phase 5 refinements (header, looping carousel, sort, grid, stats)

Migrations: `0018_listing_views_rank.sql` (views table, `record_listing_view`, `listing_stats`) and `0019_views_every_click.sql`
(every visit counts as a view; the 60-per-minute-per-person limit stays). Tests: sort, grid badge, address and loop maths in `tests/marketplace-view.test.ts`.

- **Header** (`app-header.tsx`, signed-out header in `(public)/layout.tsx`): from 640px up it is two centred rows, the mark and
  tabs on top and the account bar (prompts meter, History, profile) under it. Phones keep the one-row bar. The meter's card
  now opens from its left edge so it stays on screen. The sticky offsets on the persona hero and the character page were raised to clear the taller bar.
- **Looping carousel** (`coverflow.tsx`): with three or more personas the list is drawn three times (five when there are
  fewer than six), starts in the middle copy and, when a scroll settles (and no finger is down), silently jumps whole copies back to
  the middle, so there is never an edge. Left and right arrows, arrow keys, Home/End, story bubbles (jump to the nearest copy)
  and the slideshow swipe-handoff all work. One or two personas just sit centred. Only the middle copy owns the page-transition
  names (`MarketCard primary`); copies are lazy-loaded. Phones loop too. Maths is in `view.ts` (`loopCopies`, `nearestSlot`, `loopShift`).
- **Sort** (`market-controls.tsx`): Trending (Virality Rank, sold ones by views + likes), Newest, Most liked, Price low/high.
  Pills on a computer, a dropdown on a phone. Only reorders. Kept in the address as `?sort=` (and `?view=`, `?tab=`); persona links
  carry them so the back arrow returns to the same place. `getListingStats()` is loaded in the browse route.
- **Grid view**: `?view=grid` (default Cards). `market-grid.tsx`: 2 columns on phones, 3 on tablets, 4 from 1024px, 5 from 1440px; tall
  portrait cards, badge top-left (top-ten rank, NEW in the last 3 days, SOLD), heart top-right, name and price pill at the bottom.
  The whole card is one link; the heart and admin controls are not inside it. Hovering with a mouse flips through her pictures
  (extra pictures only load on first hover).
- **Persona stat cards**: Rank (`#1`, or "Sold"), Views ("times her page was opened"), Likes (same count as the heart), Listed.
  The persona page calls `recordView` once per page open (on mount).
- **Browse top redesign** (`market-browser.tsx`, `market-controls.tsx`, `market-progress.tsx`): a centred hero (social-proof pill with
  up to four overlapping covers, live "N available · M sold" and a slim sold-share track, then the poster-font title (hidden on phones),
  then a one-line subtitle) and ONE toolbar row on the content edges: Available/Sold pills (white when active, count badges) left,
  a custom accessible Sort dropdown (listbox: arrows, Enter/Space, Esc, outside click) and a Cards/Grid icon toggle right. Phones
  stack it: tabs 50/50, then sort + toggle. Story bubbles (52px) only in Cards view. The live-count logic (Realtime, 30s poll, refresh) is unchanged.
- **Virality Rank** = views + likes among personas still for sale, #1 highest; sold personas have no rank.

## Manual setup so far

Run these in the Supabase SQL editor, in order. Skip any you've already run: each one fails with "already exists" if
run twice.

1. `supabase/migrations/0012_daily_usage.sql`: daily prompt allowances (from the prompt-first pivot).
2. `supabase/migrations/0013_app_settings.sql`: admin settings for caps and the server model (from the pivot).
3. `supabase/migrations/0014_marketplace.sql`: marketplace tables, RLS, and the two storage buckets.
4. `supabase/migrations/0015_purchase_persona.sql`: the purchase function.
5. `supabase/migrations/0016_marketplace_realtime.sql`: live marketplace counts (the public pulse row and its Realtime feed).
6. `supabase/migrations/0017_listing_likes.sql`: public hearts on personas.
7. `supabase/migrations/0018_listing_views_rank.sql`: persona page views and the Virality Rank.
8. `supabase/migrations/0019_views_every_click.sql`: every page visit counts as a view.
9. `supabase/migrations/0020_group_photo.sql`: allows the `group_photo` generation kind.

## Group photo
On the Characters page, shown only when image generation is on (and disabled until there are 2 characters with a reference sheet). It turns the cards into a picker for 2 to 4 characters. A dock shows who is picked, and Continue opens a composer for creative direction and Generate. The server (`group_photo` kind, `groupJob` in generation-job, prompt in `src/lib/ai/prompts/group.ts`) sends only each character's reference sheets, in turn: her face sheet then her body sheet, never her reference photos or pack crops, so at most 8 images for 4 characters. Only characters with a sheet can be picked. Her read sheet pack still supplies her look in words. Each character gets a named identity block, and the person's direction goes in as the scene to follow closely. The characters are saved in `generations.params.group_ids`.
