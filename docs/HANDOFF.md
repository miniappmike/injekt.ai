# Project handoff

## Current state (November 2026)

Live at injektai.vercel.app. Everything below this section is the older build history; where the two disagree, this
section is right.

**What's live**
- Characters, Create Model, Inject (Recreate by default, "Edit this photo" opt-in), Variants, Likeness, Art to Real,
  group photos, History, the ledger, and the persona marketplace (browse and admin listing; buying isn't wired).
- **Tokens and plans** (`docs/PRICING.md`): 15 free tokens at sign-up, Pro at $9.99 / 30 days, four token packs.
  Bring-your-own keys are Pro-only; the free plan uses the platform's SpicyAPI key with daily limits.
- **Payments**: Telegram Stars (@ModelSpawnBot) and crypto (NOWPayments). Both are set up and connected in production.
- **Admin** (`/admin`, admins only), four tabs that each load only their own data:
  - Orders: verified revenue chart (7d / 14d / 30d / 6m / all), the order list (Mark paid, Cancel), payment status,
    and Telegram alerts.
  - People: a small CRM (search, filters, sort); each person's page leads with their email and has their tokens (add
    or remove), token activity, orders and calls on the platform key.
  - Limits: the free plan's daily caps. Costs: what the platform key is costing.
  - On phones the tabs stay pinned under the top bar and tables become cards.
- **Telegram alerts for admins** (`src/lib/payments/alerts.ts`): a message on every payment, Pro renewal, short crypto
  payment and sign-up. Connected once from Admin; stays on until turned off. Sent in the same request as the event, so
  nothing polls.
- **Legal**: Terms and Privacy pages, 18+ and terms boxes at sign-up, account deletion (orders and bonus claims are
  kept without the person), contact modelspawn@gmail.com.
- **Home screen icon**: `src/app/apple-icon.png`, `src/app/manifest.ts`, `public/icons/`.
- **Calmer menus** (November 2026 pass): Variants' Moments has four "Include" chips and one "Posting to" menu grouped
  by tone; Inject's options are one row (Pose, Outfit, Versions, Which person) with prompt format under More options;
  helper paragraphs and "optional" tags are gone across Variants, Inject and the character pages.
- **Inject Outfit menu**: one menu (same as the photo, same outfit in new colours, a new outfit, her signature style,
  an outfit I choose) sets `ward`, `newOutfit` and `recolor` together so they can't contradict. "An outfit I choose"
  takes an outfit photo, read into words once (`extractOutfit`), editable and saveable.
- **Create Model body blend**: with 2 or 3 body photos, "These photos are" can be "Different bodies, blend them"
  (`blend` in the sheet meta): one composite body keeping the boldest feature from each photo. The bust and glute
  fine-tune no longer says "natural"; cups go to J and glute size has Extreme.
- **Likeness fix keeps the outfit**: it rebuilds only face, hair, skin tone and body proportions under `OUTFIT_LOCK`
  (`src/lib/ai/prompts/likeness.ts`), and clothing fixes are dropped. It sends the image to fix, then her face sheet,
  then her body sheet.
- **Pin It**: any generated image of a character can be pinned to her reference photos (up to 5 per character,
  `MAX_REFERENCE_PHOTOS` in `src/lib/reference-limits.ts`). A vision check (`src/lib/ai/prompts/pin.ts`, ledger
  feature "Pin check") refuses visible nudity first. At 5, a pop-up with a confirmation box replaces her last photo.
  Pinned files live in `<user>/pinned/<character>/`: kept when replaced or removed from her references, deleted with
  the character or the account. A character page with no reference photos links to Inject to make some.
- **API key guide**: notes that setup was tested with Claude Sonnet 5.5 and Seedream 5 and that the developer now uses
  Claude Haiku 5.5 with Seedream 5.5 ("Latest Iteration"); Kimi K3.1 Pro is marked "Tested". The Haiku 5.5 SpicyAPI ID
  (`anthropic/claude-haiku-5.5/chat`) follows the Sonnet ID's pattern; confirm it against SpicyAPI's model list.

**Database**: migrations 0001 to 0025 are all run in production (0023 tokens, 0024 account deletion, 0025 payment
providers). **0026 (five reference photos) must be run** before a 4th or 5th reference photo can be saved.

**Nightly job** (`/api/cron/cleanup`, 03:00 UTC): expired images, unfinished marketplace copies, final ledger charges,
unpaid orders older than 3 days, cancelled or failed orders older than 24 hours.

**Decisions that changed since the notes below**
- No Lemon Squeezy or Stripe: card processors were ruled out; payments are Telegram Stars and NOWPayments.
- BYOK is Pro-only (it used to be for everyone).
- No content rules on generation beyond the model providers' own (decided, don't re-raise). The one exception, asked
  for by the owner: images pinned to a character's reference photos must not show nudity (the Pin It check).
- Staying on Vercel; upgrade to Vercel Pro before relying on sales (Hobby is non-commercial).

**Next, in rough order**
1. Marketplace checkout through Telegram or NOWPayments (the Buy button says checkout is being set up).
2. Owner's to-do: Vercel Pro, a spend cap, and setting the Vercel function region next to the Supabase region.
3. Optional: a lawyer's read of Terms and Privacy, a report button, a manual Cash App flow.

**Working rules**
- Secrets only in Vercel env vars, never in chat or the repo.
- Screenshots for review use throwaway pages under `src/app/auth/pv-*`, deleted before committing.
- Work goes on a branch, then a pull request, then merged to `main` once the Vercel build passes.

## Product
ModelSpawn: build persistent AI influencer characters, optimize prompts, and inject a character into a target image via image models. BYOK for vision, language and image APIs. Prototype UI described in `docs/ui-reference.md` (tabs: Inject, Variants, Likeness, Reference Sheet, Characters).

## Decisions made
- Next.js App Router + TS, Supabase (auth, Postgres, Storage, Realtime), Tailwind + shadcn/ui.
- Async jobs: provider webhook -> storage -> Supabase Realtime on `generations`; poll fallback; Inngest or Trigger.dev for multi-step jobs.
- Key resolution: user BYOK key first; server env key (`SPICY_API_KEY`) only for `profiles.is_admin`; otherwise error redirecting to `/settings/api-keys?provider=...`.
- BYOK keys encrypted app-side (AES-256-GCM), ciphertext readable only via service role.
- SpicyAPI is just another cheaper provider (an `ImageProvider` adapter, shell only, needs provider docs).
- Master prompt (`src/lib/ai/master-prompt.ts`) is prepended to every vision/language call via `createGuardedClient`; its goal is character consistency in injected prompts.
- Dropped: "clean up overlays". Not wanted: age gate, hard blocks (platform is an access point; models' own rules apply). Kept: provenance attestation timestamp, content reports table.
- Added libs: zod, t3-env, Vercel AI SDK (vision/LLM, to add), TanStack Query, react-hook-form, sharp, Sentry, Upstash Ratelimit, Playwright, pgTAP.

## Done (branch claude/foundation-scaffold)
Schema migration with RLS, crypto, key resolver, SSRF guard, rate limiter, webhook route, master prompt + guard, provider types, tests (18 passing).

Also done: email/password auth (login, signup, callback, signout, `src/proxy.ts` session refresh + redirect), shadcn-style UI shell with the five-tab nav, characters CRUD with provenance attestation (profile version history was dropped on purpose, see `0002_drop_profile_versions.sql`) (text fields only, no photos yet).

Also done: signed uploads with EXIF stripping (`/api/uploads/finalize`, `src/lib/images.ts`, migration `0003_storage.sql`), API key manager at `/settings/api-keys` (Anthropic, OpenAI, OpenRouter, SpicyAPI shell; keys with hidden/non-ASCII characters are rejected), profile builder on the character edit page, and a prompt writer on `/inject` (one vision call per target image, prompt is copied out; no image generation yet).

API keys are set per job, not per provider: Vision, Text (and Image, coming soon) at `/settings/api-keys`. The user pastes one key; the provider is detected from its prefix (`sk-ant-`, `sk-or-`, `sk-`, `AIza`, see `src/lib/ai/providers/detect.ts`). Unrecognised keys are treated as OpenAI-compatible and the user enters a base URL and model (provider `custom`; the URL is SSRF-checked on save and on every call). SpicyAPI chat is reached this way, and `spicyapi.ai` base URLs get their own request shape. Config lives in `user_settings.prefs.roles`, keys in `user_api_keys` with `kind` = role. A role with no setup falls back to the other, and a role can reuse another role's key with its own model (`keyFrom` in `prefs.roles`, so one multimodal key can serve Vision, Text and later Image). The key page has a Test key button (one tiny real request) and provider errors name the model when a key is restricted. Unverified against live APIs: whether SpicyAPI's `image_url` accepts base64 data URIs (its docs list a 6000 image-token cap, so images go at 768px). Image providers have no common standard, each needs its own adapter.

Free-tier limits are built: see `docs/PRICING.md` (`src/lib/limits.ts`, `src/lib/entitlements*.ts`, migration `0004_free_tier_limits.sql`, SQL tests in `tests/sql` using PGlite). To use the app without limits set `profiles.is_admin = true` or `plan = 'pro'` for your user in the Supabase SQL Editor.

Also done: Variants (edit prompts per chosen change) and Carousel (plan from a cover), both Pro-only at `/variants`. Also: prompt history (the Prompts tab of the History side panel; migration `0005_prompt_history.sql`, newest 100 kept) and the Likeness checker (`/likeness`, Pro-only, saves reports to history). Images can be added while creating a character (held in `<uid>/characters/pending/` and attached on save; deleting a character deletes its images). Known gap: images from abandoned drafts, and target/generated images from failed runs, are not cleaned up yet; add a storage sweep for `pending/` and `targets/` later.

Generated images are kept for 72 hours (`src/lib/retention.ts`, migration `0006_generation_retention.sql`): the webhook sets `generations.expires_at`, a storage policy stops access at that moment, a daily Vercel Cron job (`vercel.json`, `/api/cron/cleanup`, needs `CRON_SECRET`) deletes the files and clears `output_path`, and the Images tab of the History panel shows the notice, a countdown with a tooltip and a download link. If a polling fallback is added for lost webhooks it must set `expires_at` too. Uploaded target images (`<uid>/targets/`) are not covered by this and still need a sweep.

Image generation is built on SpicyAPI (`src/lib/ai/providers/spicyapi.ts`, uses the official `@spicyapi/sdk`, default model `bytedance/seedream-5.0-pro/edit`). SpicyAPI keys start with `sk-spicy-` and are detected as such; the Image job on `/settings/api-keys` only accepts them (no common standard for image APIs, each provider needs an adapter in `src/lib/ai/providers/`). One SpicyAPI key can serve Vision, Text and Image (a job can borrow another job's key). Flow (`src/lib/generation.ts`): the browser starts a generation (`/generate/actions.ts`), then polls every 3 s; opening the History panel's Images tab also finishes anything pending (`listGenerations` in `src/lib/generation-list.ts` calls `collectPending` first), and while an image is still generating the open panel keeps checking it every 4 s. Polling, not webhooks, because SpicyAPI signs webhooks with each account's own secret, which we do not have for BYOK users. Inputs are signed links to private storage; prompts' `@imageN` labels become `Image N`; the provider's own retention is set to 72 h to match ours. Who pays: Pro/admin use their Image key (admins can fall back to `SPICY_API_KEY`); free accounts get 1 lifetime image at 1k on `SPICY_API_KEY` with a confirmed email, handed back if the job fails. Inject has three tabs: Write prompts (Pro), Direct swap and Edit (free image works here). Generate buttons also appear on Variants, Carousel and Likeness prompts. The webhook route is kept but unused by SpicyAPI.

The ledger (`api_ledger`, migration `0008_api_ledger.sql`, `src/lib/ledger.ts`, page `/ledger`): one row for every AI call with the API platform (`anthropic`, `openai`, `spicyapi`, or the host of an "other provider"), job, feature, model, tokens, cost, and where the cost came from (`provider`: image jobs, reported by the platform; `list_price` / `your_price`: text calls, tokens x a price per million tokens; unknown prices are stored as `cost_known = false`, never guessed). Written by the server only (`recordLedgerEntry`, `recordTextCall`; image rows in `collectGeneration`, once per generation, including failed ones); people can read their own rows. `ledger_summary()` gives per-platform totals; platform-paid calls (the free image, `key_source = 'server'`) are listed but not counted as the person's spend. The page polls every 5 s, filters by platform, job and range, loads more, and exports CSV. It replaces `usage_ledger` and the earlier live meter, cost hints and typical-cost estimates, which were removed. Text calls get a dollar amount only if the model has a list price (built in for Claude Sonnet 5.5 only) or the person entered one on the key card (`prefs.roles[job].price`, cleared when the model changes). The Generate button still shows the provider's exact price before a generation starts.

History and the profile menu (header, `src/app/(app)/layout.tsx`): the header's right side is only the History button and a profile menu. History is one side panel with two tabs, Prompts (saved prompts, search, character filter, export, delete all) and Images (everything generated, newest 50, with the 72-hour notice, countdown, download, cost and a Ledger link; `src/components/history-panel.tsx`, `history-images.tsx`, actions `getHistory` and `getGenerations`). There is no `/generations` page any more. Anything can open the panel on a tab with `openHistory("images")` from `src/lib/panel-events.ts` (the Generate button's "All images" link does). The profile menu (`src/components/profile-menu.tsx`) opens on mouse hover, and on tap or keyboard for touch screens, and holds Ledger, API keys and Log out. The layout sets `maxDuration = 60` because finishing a job downloads and stores the image.

Create Model (the nav item was "Reference Sheet"; the route is still `/reference-sheet`; `src/components/reference-wizard.tsx`, page `src/app/(app)/reference-sheet/page.tsx`, actions `actions.ts` with `createPersona`, prompts in `src/lib/ai/prompts/sheets.ts`, options in `src/lib/sheet-options.ts`): a four-step wizard whose character picker defaults to "New persona". 1) face photo (a new persona is created at the end of this step with just a name and the ownership tick, so sheets have a character to attach to; the URL becomes `?character=<id>` so a refresh resumes; at the free-plan limit the "New persona" option is hidden), 2) face sheet, 3) up to `MAX_BODY_PHOTOS` (3) body photos with optional fine-tune options (bust, glute size and shape, or an outfit taken from body photo 1 or typed), 4) the reference sheet prompt. With image generation off each step shows the finished prompt, the ordered attach strip (@image1 face sheet or photo, then @image2 to @image4 the body photos) and a drop box to upload the finished sheet back (slot `face_sheet` or `body_sheet` attaches it to the character); with generation on a Generate button makes it (`GenerateImage`, kind `reference_sheet`, label becomes "Regenerate" after a result) and "Save as her face/body sheet" copies it into the character (`saveReferenceSheet`, `attachGeneratedSheet` in `src/lib/reference-sheet.ts`). The prompts are fixed templates (no model call, so they are instant and free). Face sheet: a short plain prompt, a no-text borderless sheet of the woman in @image1, two rows of three (straight neutral face, then smiling with realistic non-perfect teeth; each forward, at 45 degrees, in profile), bare shoulders and up, no accessories or earrings; 3:2. Body sheet: four uncropped full-body views in one row (front, three-quarter, left side, back) separated by thin white vertical gutters, borderless, same scale and floor line, no separate portrait grid; 1:1; body matched strictly to the photos; outfit chosen with the Covered / Bikini toggle at the top of step 4 (Covered = plain white crop tube top and very short white shorts wrapped tightly, Bikini = plain black bikini, both barefoot; the old "default" outfit id still means Covered); both sheets say "No earrings or necklaces" and no prompt mentions piercings (asking for them made the image model add some). The bottom generation tray is hidden on this page because each result already shows in place; it keeps tracking jobs so a sheet started on one step still reaches History. Photos uploaded in the wizard are plain `targets/` uploads, so they join the existing "no sweep for `targets/`" gap. Image generations of kind `reference_sheet` need no migration and run through `startGeneration` with price-before-click, polling, the ledger and the History Images tab like any other image. Not yet checked against the live provider after the latest prompt rewrites: how well Seedream follows the one-row four-view layout.

Characters page (`src/app/(app)/characters/page.tsx`, `src/components/character-card.tsx`, `character-card-actions.tsx`): each card has a magnifier that opens a panel with all of the character's reference images and sheets in a sideways-scrolling strip (arrow buttons on desktop, swipe on phones; tapping an image opens the full-screen viewer), a red Delete button with a confirmation (everyone), and a green List button that is shown to admins only and links to the character page's Marketplace panel (`#marketplace`). On phones the card footer is List (or Edit for non-admins) plus a trash icon, and the History button tucks against the right edge on this page so it doesn't cover the buttons.

Logo and favicon: the pink "m" mark is drawn by `src/components/logo.tsx` (used by the desktop header, the phone top bar with `small`, and the auth and public layouts) and `src/app/icon.svg` is the favicon (tight crop, no background tile; a dark rounded-tile variant was tried and parked).

Image viewing and the generation tray (both mounted once in `src/app/(app)/layout.tsx`): `ImageViewer` (`src/components/image-viewer.tsx`) opens with `viewImage()` from `src/lib/panel-events.ts` and shows an image full screen with drag to move, scroll or pinch to zoom, +/- and a percentage, double-click for actual size, Fit to screen, Full screen, Download and Copy prompt. Generated results, the tray, and both History tabs open it. `GenerationTray` (`src/components/generation-tray.tsx`) is a strip along the bottom of the page: every Generate press reports itself with `reportGeneration()` (generating, then ready or failed), and the tray empties when the path changes or the page reloads. History prompts (inject, variant, carousel) have a Generate button that reruns the saved prompt with the character's current references and the saved photo; Variants and Carousel have Generate all (image starts are limited to 12 a minute).

Prompt writing rules (`src/lib/ai/tasks/`): every image prompt ends with the realism line in `realism.ts` (realistic skin texture, smartphone grain, natural depth, light and shadows, no overlays or watermarks, no shiny/glossy/waxy skin, real imperfections). The models are told to write it, and `withRealism` adds it in code after parsing (Inject, Variants, Carousel, the Likeness edit prompt, Direct swap); reference sheets don't get it, since they want a clean studio look. Variants and Carousel use only the character's face and body sheets plus the user's image (`referencesFor` in `src/lib/character-images.ts`, falling back to reference photos when there are no sheets); prompt writing and generation both call it, so @image numbers always match the images sent. Edits mode writes N variations (1 to 8, default 4), each changing all the selected aspects together and nothing else. Carousel briefs the model as a social media creative director with no fixed list of shots; each slide is an edit of the cover. A Generate button that goes away mid-job (switching tabs, a new result) hands the job to the bottom tray, which keeps checking it until it finishes. Prompts saved before this change used all the reference images, so their @image numbers no longer match when generated again from History.

Extra images on Variants (Edits and Carousel): besides the main image (the image to edit, or the cover) a user can add up to 2 more for vibe, outfit or styling. They come after the main image in @image order (character sheets, main image, extras), the model is told what they are for, and every Generate sends them in the same order. History keeps them in `prompt_history.extra_image_paths` (migration `0009_history_extra_images.sql`, at most 2) so generating again from History sends the same images. The column is only written when a batch has extras and history is read with `select("*")`, so the app keeps working before 0009 is run. `removeUnusedImages` checks both columns and deletes nothing if it can't tell what is still in use.

## Next
See "Current state" at the top. The older list that was here (Lemon Squeezy, a wallet with hold-and-settle) was replaced by tokens, Telegram Stars and NOWPayments.
