# Architecture

Next.js (App Router, TS) + Supabase (auth, Postgres, Storage, Realtime) + Tailwind/shadcn.

## Generation flow
1. Server action authenticates the user, rate limits, resolves the key, inserts a `generations` row (`pending`), submits the job to the provider with a webhook URL.
2. Provider calls `/api/webhooks/[provider]`. The route verifies the HMAC signature, is idempotent per job id, downloads the output through the SSRF guard, stores it in the private `generations` bucket and marks the row `complete`.
3. The browser subscribes to its `generations` rows with Supabase Realtime. A slow poll via `ImageProvider.poll` covers lost webhooks.

## Keys
- BYOK keys are AES-256-GCM encrypted in the app layer (`src/lib/crypto.ts`). The master key is in env, not the DB. Ciphertext has no RLS policy, only the service role reads it (`src/lib/key-store.ts`). The client only sees `last4`.
- `resolveApiKey`: user key, else server env key for `profiles.is_admin` only, else `ApiKeyRequiredError` which redirects to `/settings/api-keys?provider=...`.

## Master prompt
`src/lib/ai/master-prompt.ts` is prepended to every vision and language call. Callers only get a `GuardedTextClient` (`guarded-client.ts`), so it cannot be skipped.

## Providers
Three adapter shapes live in `src/lib/ai/providers/types.ts`: image, vision, llm. SpicyAPI is an `ImageProvider` shell awaiting the provider docs.

## Safety
SSRF guard on every server-side fetch of user-supplied URLs, signed uploads and EXIF stripping (browser uploads raw to `<uid>/raw/`, the server re-encodes to clean JPEG and deletes the raw file), per-user rate limits, usage ledger, provenance attestation timestamp on characters, content report table. The "clean up overlays" feature is intentionally not part of this build.

## Still to build
image generation for inject, variants/likeness, Inngest or Trigger.dev for multi-step jobs, Sentry with scrubbing, Playwright tests, pgTAP RLS tests.
