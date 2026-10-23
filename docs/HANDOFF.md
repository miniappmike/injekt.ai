# Project handoff

## Product
Model Spawn: build persistent AI influencer characters, optimize prompts, and inject a character into a target image via image models. BYOK for vision, language and image APIs. Prototype UI described in `docs/ui-reference.md` (tabs: Inject, Variants, Likeness, Reference Sheet, Characters).

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

Also done: prompt history (`/history`, migration `0005_prompt_history.sql`, newest 100 kept) and the Likeness checker (`/likeness`, Pro-only, saves reports to history). Known gap: target/generated images uploaded for a run that fails are not cleaned up yet; add a storage sweep later.

## Next
0. Lemon Squeezy: Pro subscription checkout + webhook that sets `profiles.plan`, then credits wallet with hold-and-settle (see PRICING.md). 1. Inject image generation: direct swap and edit (needs the SpicyAPI adapter and its docs, or another image provider). 2. Variants and carousel (text/vision, no image provider needed). 3. Face fix (needs image provider). 4. Reference sheet maker. 6. Design pass once Inject works end to end. 7. Sentry, Playwright, pgTAP RLS tests.
