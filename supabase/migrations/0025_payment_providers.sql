-- Payments through Telegram Stars and NOWPayments.
-- An order now records how it's being paid (provider, set when checkout starts) and, for Telegram, its price in Stars.
-- A payment's own id (Telegram's charge id, NOWPayments' payment id) goes in provider_ref, which is unique per
-- provider (0023), so a repeated notice can never deliver twice.
alter table public.orders add column if not exists amount_stars int check (amount_stars is null or amount_stars > 0);
-- The last status the provider reported (for NOWPayments: waiting, confirming, partially_paid, finished, expired...).
alter table public.orders add column if not exists provider_status text;
-- A Telegram Pro renewal points at the order that started the subscription.
alter table public.orders add column if not exists renews_order_id uuid references public.orders on delete set null;
