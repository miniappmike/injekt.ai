# Pricing, tokens and payments (built and live)

Last updated November 2026. The numbers live in `src/lib/plans.ts`; change them there, not here.

ModelSpawn sells a prompt-optimization workflow. People pay with **tokens** (the site's credits) or, on Pro, bring
their own model keys.

## Plans

| | Free | Pro ($9.99 / 30 days, or 500 Telegram Stars) |
|---|---|---|
| Tokens | 15 once, at sign-up | 220 the first month (once per person), then 200 a month |
| Own API keys (BYOK) | No | Yes: with an own image key, images cost no tokens |
| Daily limits | Yes, set in Admin → Limits (prompts, likeness checks, images) | None |
| Platform key | Yes, paid with tokens | Yes, paid with tokens when no own key |

Admins (`profiles.is_admin`) are unlimited. Pro is either set by hand in Admin (`profiles.plan = 'pro'`) or a paid
30-day pass (`profiles.pro_until`).

## What tokens cost

- A prompt: 1 token (free when using an own vision key on Pro).
- A profile build: 2 tokens.
- An image: 2 tokens at 1k, 3 at 1.5k, 4 at 2k.

## Token packs (bought tokens never expire)

| Price | Tokens | Telegram Stars | |
|---|---|---|---|
| $10 | 200 | 500 | |
| $25 | 525 | 1,500 | Popular |
| $50 | 1,100 | 2,500 | |
| $100 | 2,300 | 5,000 | Best value |

## How tokens work (migration 0023)

- Tokens are held in lots (`credit_lots`: source `signup`, `pro`, `topup` or `admin`) and spent soonest-expiring first
  (`spend_credits`). Pro-month tokens expire when the month does; bought and admin-added tokens don't.
- A failed call gives its tokens back (`refund_credits`). The balance can't go negative.
- The first-month bonus (220 instead of 200) is given once per email, device and IP (`bonus_claims`).
- All of this is server-only (service role); the browser can't change a balance or a plan.

## Payments

There is no card processor. Two ways to pay, each shown once its keys are set in Vercel:

- **Telegram Stars** (`src/lib/payments/telegram.ts`): the @ModelSpawnBot bot makes an invoice link; the buyer pays in
  Telegram (card, Apple Pay, Google Pay). Pro is a Stars subscription that renews every 30 days until cancelled in
  Telegram. Telegram pays out about $0.013 a Star (`STAR_PAYOUT_USD`, an estimate used by the admin chart).
- **Crypto through NOWPayments** (`src/lib/payments/nowpayments.ts`): an invoice in US dollars, opened in a new tab;
  the buyer picks the coin. An order is delivered only when the payment is `finished`, the price matches, and at least
  99% of the amount asked actually arrived (`COVERING`, matching "Payment covering" in NOWPayments). Anything short is
  marked `underpaid` and waits in Admin.

Both deliver through `fulfill_order` (idempotent, so a repeated notice never delivers twice). Orders are in the
`orders` table. Unpaid orders are deleted after 3 days and cancelled or failed ones after 24 hours, by the nightly job;
ones a crypto payment is still moving on are kept.

Env vars: `TELEGRAM_BOT_TOKEN`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, optional `NOWPAYMENTS_SANDBOX=1`.
After adding the Telegram token, press **Connect Telegram bot** once in Admin → Orders → Payments.

## Refunds (as written in the Terms)

No returns and no refunds: a purchase buys 30 days of access or tokens, and model costs go to the model provider, which
doesn't refund. Failed generations return their tokens automatically. Support: modelspawn@gmail.com.

## Not built

- Buying a marketplace persona (the Buy button says checkout is being set up).
- A card processor.

## Costs to keep in mind

- Vercel Hobby is for non-commercial use; move to Pro (about $20 a month) before relying on sales.
- Supabase free projects pause when idle and have no backups; Pro is about $25 a month.
