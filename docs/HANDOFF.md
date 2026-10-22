# Project handoff

## Product
Injekt.ai: build persistent AI influencer characters, optimize prompts, and inject a character into a target image via image models. BYOK for vision, language and image APIs. Prototype UI described in `docs/ui-reference.md` (tabs: Inject, Variants, Likeness, Reference Sheet, Characters).

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

## Next
1. Auth pages + shadcn UI shell. 2. Signed uploads + EXIF strip. 3. Characters CRUD + versioning + profile builder. 4. Prompt optimizer. 5. Inject / direct swap / edit. 6. Variants, carousel. 7. Likeness + face fix. 8. Prompt history. 9. SpicyAPI adapter once docs are provided.
