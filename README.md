# Model Spawn

Build persistent AI characters, write optimized image prompts for them, and generate images. Sold as tokens and a Pro
plan, paid with Telegram Stars or crypto.

Next.js 16 (App Router, TypeScript) + Supabase (auth, Postgres, Storage, Realtime) + Tailwind, hosted on Vercel.

```
cp .env.example .env.local   # fill in values
npm install
npm test
npm run dev
```

## Where things are written down

- `docs/HANDOFF.md`: the current state of the project, what's live, what's next. Start here.
- `docs/ARCHITECTURE.md`: how the pieces fit (generation, keys, tokens, payments, admin, speed).
- `docs/PRICING.md`: plans, token prices, packs, payments and refunds.
- `PROGRESS.md`: the detailed build log, including the marketplace phases and the database migrations to run.
- `docs/ui-reference.md`: the original prototype UI notes.

## Deploying

Pushing to `main` deploys on Vercel. Secrets go in Vercel → Settings → Environment Variables (then redeploy). New
database migrations in `supabase/migrations` are run by hand in the Supabase SQL editor, in order.
