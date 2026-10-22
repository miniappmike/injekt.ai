# Pricing and plans (draft, nothing here is built yet)

Model Spawn is bring-your-own-key. Users pay their own model providers; the platform sells the workflow.

## Plans
| | Free | Pro ($9.99/month) | Credits (prepaid, optional) |
|---|---|---|---|
| Purpose | Try it | Full prompt-optimization suite with your own keys | Use the platform's key instead of setting one up |
| Characters | 1 | Unlimited | n/a |
| Profile rebuilds ("rescans") | 3 lifetime | Unlimited (own key) | Metered |
| Image generation | 1 lifetime, verified email, house key | Own key | Metered |
| Prompt writing | open question below | Unlimited (own key) | Metered |

Admins (`profiles.is_admin`) are unlimited and may use the server key, as today.

## Credits: never go negative
- Prepaid wallet, minimum top-up $5 to $10 (small card payments lose a fixed fee, about 30 cents, to the processor).
- Charge = real cost x (1 + markup). Start with a 25% markup, kept as one setting so it can be tuned. Round up to 0.1 cent.
- Real cost, chat and vision calls: read `usage` from the response. `prompt_tokens x input price + completion_tokens x output price`. Prices live in one table in the code and are checked against the provider's monthly bill. Example: SpicyAPI Claude Sonnet 5.5 is $2 in / $10 out per million tokens.
- Real cost, image calls: fixed price per model from the provider, times the markup.
- Hold and settle:
  1. Before a call, hold a worst case (input size plus the maximum output allowed). If the balance cannot cover it, the call does not run.
  2. After the call, charge the real amount and release the rest of the hold.
  3. Do both in one atomic Postgres function so two simultaneous requests cannot spend the same money.
- A call that fails on the provider side is released, not charged.
- Show an estimated price before running anything metered.

## Data model sketch
- `profiles.plan` (`free` | `pro`), `profiles.plan_renews_at`.
- `usage_counters(user_id, key, count)` for lifetime limits (`characters`, `profile_rebuilds`, `free_images`).
- `wallets(user_id, balance_micro_usd)`; `wallet_ledger(id, user_id, kind topup|hold|settle|release|adjust, amount_micro_usd, generation_id, created_at)`.
- Add `charged_usd` next to the existing `usage_ledger.cost_usd`.
- All limits are enforced on the server in the actions that spend (character create, profile build, generation), never only in the UI.

## Costs to cover (check current prices before relying on these)
- Vercel Pro about $20/month (Hobby is non-commercial, so it must change before charging).
- Supabase Pro about $25/month (free projects pause when idle and have no backups).
- Domain $10/year, business email $6.99/year.
- Break-even is roughly 5 subscribers after payment fees. A BYOK user costs almost nothing beyond storage.
- A free user costs roughly 15 to 20 cents in the worst case (3 rebuilds, a few prompts, 1 image).

## Payments
- Phase 1: sell only the Pro subscription, through a merchant of record (handles sales tax and VAT). Candidates: Paddle, Lemon Squeezy, Polar, Creem. Read each one's prohibited-business list and AI policy before applying; processors can freeze accounts.
- Describe the product accurately on applications: a prompt-optimization workflow where users bring their own model keys. Keep terms of service and an acceptable-use policy. The content users make is governed by their model providers' rules.
- Phase 2: house-key credits, after the subscription is running (reselling generated content is higher risk with processors).
- Keep a second processor approved as a backup and withdraw payouts regularly.

## Refunds
- Credits are non-refundable once bought; unused credits are the user's to use. Failed generations are returned to the wallet automatically.
- Subscription: cancel any time, access continues to the end of the paid period, no partial refunds.
- Caveats to settle with the processor and a lawyer: some places give consumers a legal right to cancel digital purchases within a set period unless the buyer agrees to waive it at checkout, and automatic renewals have disclosure rules. A merchant of record often applies its own buyer refund terms. A strict no-refund line also pushes unhappy buyers toward chargebacks, and a high dispute rate is a common reason for freezes, so a short discretionary window for billing errors is worth considering.

## Build order
1. Decide the open questions and the processor.
2. `usage_counters` and the free-tier limits (no money involved).
3. Pro plan gate and the subscription webhook.
4. Wallet, hold/settle, metering, then house-key credits.

## Open questions
- Does a free user get the prompt writer with their own key, or only the profile builder?
- Does Pro include any house-key allowance, or is everything on the user's key?
- Which processor, and the exact markup and top-up minimum.
