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

SpicyAPI chat (`api.spicyapi.ai/v1/chat/completions`, OpenAI-style) is a text provider using the same `spicyapi` key as the future image adapter; its docs cap image tokens at 6000 per request, so images are sent at 768px. Unverified against the live API: whether `image_url` accepts base64 data URIs.

Text providers: one key per provider (stored with kind `llm`) covers both vision and language calls. Model name is stored in `user_settings.prefs.models[provider]`. Add a provider in `src/lib/ai/providers/catalog.ts` and `text.ts`.

## Next
1. Inject image generation: direct swap and edit (needs the SpicyAPI adapter and its docs, or another image provider). 2. Variants and carousel. 3. Likeness + face fix. 4. Prompt history. 5. Reference sheet maker. 6. Design pass once Inject works end to end. 7. Sentry, Playwright, pgTAP RLS tests.
