-- Deleting an account (Settings → Delete account) removes the person and everything they made, but keeps the records
-- the business needs, with the person removed: marketplace sales, orders, and first-month bonus claims (so deleting an
-- account and signing up again can't claim the bonus twice).

alter table public.purchases drop constraint if exists purchases_buyer_id_fkey;
alter table public.purchases alter column buyer_id drop not null;
alter table public.purchases add constraint purchases_buyer_id_fkey foreign key (buyer_id) references auth.users on delete set null;

alter table public.orders drop constraint if exists orders_user_id_fkey;
alter table public.orders alter column user_id drop not null;
alter table public.orders add constraint orders_user_id_fkey foreign key (user_id) references auth.users on delete set null;

-- A claim outlives its account: it gets its own id, and the account link becomes optional.
alter table public.bonus_claims drop constraint if exists bonus_claims_pkey;
alter table public.bonus_claims drop constraint if exists bonus_claims_user_id_fkey;
alter table public.bonus_claims add column id uuid not null default gen_random_uuid();
alter table public.bonus_claims add primary key (id);
alter table public.bonus_claims alter column user_id drop not null;
alter table public.bonus_claims add constraint bonus_claims_user_id_fkey foreign key (user_id) references auth.users on delete set null;
create unique index bonus_claims_user_once on public.bonus_claims (user_id) where user_id is not null;

-- The same as 0023, except a claim whose account is gone still counts against the same device or network, and an
-- order whose account is gone is only recorded.
create or replace function public.fulfill_order(p_order uuid, p_provider text, p_provider_ref text, p_days int, p_monthly int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o record;
  until timestamptz;
  credits int;
  bonus boolean;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'order_not_found'; end if;
  if o.status = 'paid' then return false; end if;
  -- The account was deleted before the payment arrived: record the payment, deliver nothing.
  if o.user_id is null then
    update public.orders set status = 'paid', paid_at = now(), provider = coalesce(p_provider, provider), provider_ref = coalesce(p_provider_ref, provider_ref) where id = p_order;
    return true;
  end if;
  update public.orders set status = 'paid', paid_at = now(), provider = coalesce(p_provider, provider), provider_ref = coalesce(p_provider_ref, provider_ref)
  where id = p_order;

  if o.kind = 'pack' then
    insert into public.credit_lots (user_id, source, amount, remaining, order_id) values (o.user_id, 'topup', o.credits, o.credits, o.id);
    return true;
  end if;

  credits := p_monthly;
  bonus := false;
  if o.first_month_bonus then
    begin
      insert into public.bonus_claims (user_id, email_key, device_hash, ip_hash, order_id) values (o.user_id, o.email_key, o.device_hash, o.ip_hash, o.id);
      bonus := not exists (
        select 1 from public.bonus_claims b where b.user_id is distinct from o.user_id
        and ((o.device_hash is not null and b.device_hash = o.device_hash) or (o.ip_hash is not null and b.ip_hash = o.ip_hash))
      );
    exception when unique_violation then bonus := false;
    end;
    if bonus then credits := o.credits; end if;
  end if;

  select greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days) into until from public.profiles where id = o.user_id;
  update public.profiles set pro_until = until where id = o.user_id;
  insert into public.credit_lots (user_id, source, amount, remaining, expires_at, order_id, note)
  values (o.user_id, 'pro', credits, credits, until, o.id, case when bonus then 'first month' end);
  return true;
end $$;
