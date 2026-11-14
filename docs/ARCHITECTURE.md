# Architecture

Next.js (App Router, TS) + Supabase (auth, Postgres, Storage, Realtime) + Tailwind/shadcn.

## Generation flow
1. Server action authenticates the user, rate limits, resolves the key, inserts a `generations` row (`pending`), submits the job to the provider with a webhook URL.
2. Provider calls `/api/webhooks/[provider]`. The route verifies the HMAC signature, is idempotent per job id, downloads the output through the SSRF guard, stores it in the private `generations` bucket and marks the row `complete`.
3. The browser subscribes to its `generations` rows with Supabase Realtime. A slow poll via `ImageProvider.poll` covers lost webhooks.

## Keys
- BYOK keys are AES-256-GCM encrypted in the app layer (`src/lib/crypto.ts`). The master key is in env, not the DB. Ciphertext has no RLS policy, only the service role reads it (`src/lib/key-store.ts`). The client only sees `last4`.
- Own keys are Pro-only. Without one, calls use the server key (`SPICY_API_KEY`) and are paid in tokens (see Tokens and plans).

## Master prompt
`src/lib/ai/master-prompt.ts` is prepended to every vision and language call. Callers only get a `GuardedTextClient` (`guarded-client.ts`), so it cannot be skipped.

## Providers
Three adapter shapes live in `src/lib/ai/providers/types.ts`: image, vision, llm. Image generation runs on SpicyAPI (`src/lib/ai/providers/spicyapi.ts`), polled rather than webhook-driven; text and vision calls go through the provider detected from the key.

## Safety
SSRF guard on every server-side fetch of user-supplied URLs, signed uploads and EXIF stripping (browser uploads raw to `<uid>/raw/`, the server re-encodes to clean JPEG and deletes the raw file), per-user rate limits, usage ledger, provenance attestation timestamp on characters, content report table. Inject's "Clean up overlays" removes app UI, watermarks and stickers from a target before the prompt is written (`src/lib/overlay-cleanup.ts`), keeping the original.

## Characters and reference images
A character has a profile photo (display only), a face sheet, a body sheet and up to 5 reference photos (`MAX_REFERENCE_PHOTOS`, `src/lib/reference-limits.ts`; database check from migration 0026). Uploads land in `<uid>/raw/` and are re-encoded into her folder. Generated images are pinned with Pin It (`src/app/(app)/characters/pin-actions.ts`): a vision check refuses nudity, then a clean copy goes to `<uid>/pinned/<character id>/`. Pinned files stay in storage when replaced or removed from her references, and are deleted with the character (the whole pinned folder) or the account (`src/lib/account-deletion.ts` clears every user folder).

Sheets are made in Create Model (`src/lib/ai/prompts/sheets.ts`); several body photos are either one body from other angles or, with `blend`, different bodies combined keeping the boldest features. Image jobs send her sheets after the target (`src/lib/generation-job.ts`); a likeness fix sends the image, her face sheet and her body sheet, and changes only who she is, never the outfit (`OUTFIT_LOCK`).

## Tokens and plans
Numbers in `src/lib/plans.ts`. Tokens are lots in `credit_lots`, spent soonest-expiring first by `spend_credits`, given back by `refund_credits`; `credit_balance` reads the total. Pro is `profiles.plan = 'pro'` (set by hand) or `profiles.pro_until` in the future (a paid pass). Own keys are Pro-only (`canUseOwnKeys`); the free plan uses `SPICY_API_KEY` with daily caps from Admin → Limits. See `docs/PRICING.md`.

## Payments
An order row is created first (`src/lib/orders.ts`), then the buyer is sent to pay:
- Telegram Stars (`src/lib/payments/telegram.ts`): `createInvoiceLink` in XTR; Pro uses a 30-day subscription. Updates arrive at `/api/webhooks/telegram`, checked by a secret header derived from `WEBHOOK_SECRET` and the bot token. Pre-checkout is answered, a successful payment delivers, a recurring payment renews Pro.
- NOWPayments (`src/lib/payments/nowpayments.ts`): a USD invoice opened in a new tab. Notices arrive at `/api/webhooks/nowpayments`, checked with HMAC-SHA512. Delivered only when finished, the price matches and enough arrived.
Delivery is the `fulfill_order` SQL function, safe to call twice. `src/lib/payments/alerts.ts` then messages every admin who connected Telegram (chat id in their `user_settings.prefs`); a failed alert never fails a payment.

## Admin
`/admin?tab=orders|people|limits|costs` (`src/app/(app)/admin/page.tsx`, tabs in `src/components/admin-tabs.tsx`); each tab is its own async component so only its data loads. One person: `/admin/people/[id]`. Revenue maths: `src/lib/admin-revenue.ts`. Non-admins get a 404.

## Scheduled work
One Vercel Cron job a night (`vercel.json` → `/api/cron/cleanup`, guarded by `CRON_SECRET`): expired images, marketplace copy repair, ledger settlement, stale and cancelled orders (`src/lib/cleanup.ts`). Nothing else runs on a timer; alerts and payments are driven by webhooks.

## Speed
- `requireUser` and `loadProfile` are wrapped in React `cache()`, so the layout and the page share one Supabase call each per request.
- Fonts are self-hosted with `next/font` (`src/app/layout.tsx`), so first paint doesn't wait on Google.
- `src/app/(app)/loading.tsx` shows a skeleton while a page's data loads.
- The biggest remaining factor is distance: the Vercel function region should match the Supabase project's region (Vercel → Settings → Functions).

## Pages by audience
- `src/app/(front)/`: what a signed-out visitor sees first. `(site)/` holds the landing pages, `(auth)/` log in and sign
  up. They share one backdrop in `(front)/layout.tsx`, which stays mounted while `FrontStage` swipes the content.
- `src/app/(public)/`: pages anyone can open (marketplace, Terms, Privacy, the key guide). Signed out they use the
  landing header; signed in, the app's.
- `src/app/(app)/`: everything that needs an account. `src/proxy.ts` sends signed-out visitors to `/login`, and
  signed-in visitors from `/`, `/login` and `/signup` to `/home`.

## Home dashboard
`/home` reads everything in one go (`loadDashboard`, `src/lib/dashboard.ts`): characters, the latest generation's
character (the model in focus), recent images, counts for the month and week, the token balance, the generation
setting, and the marketplace listings with their Virality Rank. Each part that fails shows as empty. The first-steps
tile is computed from those reads, so there is no progress table. Types the browser needs are in
`src/lib/dashboard-types.ts`, because the loader is server-only.

## Navigation
`src/lib/nav.ts` holds every list: `NAV` (desktop tabs), `MORE_NAV` (desktop More menu), `DOCK_NAV` and `DOCK_MORE`
(phone dock and its sheet). Change the order there, not in the components.

## Still to build
Marketplace checkout, the Telegram payment guide, Sentry with scrubbing, Playwright tests, pgTAP RLS tests, a sweep for abandoned `targets/` and `pending/` uploads.
