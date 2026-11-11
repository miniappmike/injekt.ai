-- Credits, the Pro pass and orders.
--
-- Credits are kept as lots: each grant (the free credits, a Pro month, a top-up pack) is one row with what is left of it
-- and, for a Pro month, when it runs out. Spending takes from the lot that expires first, so monthly credits are used
-- before bought ones, which never expire. Every spend is logged and can be given back once (a failed image).
-- Only the server changes any of this; a person can read their own rows.

-- Pro is a 30-day pass (the payment providers we can use take one payment at a time, not a subscription).
alter table public.profiles add column pro_until timestamptz;

create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('signup', 'pro', 'topup', 'admin')),
  amount int not null check (amount > 0),
  remaining int not null check (remaining >= 0),
  expires_at timestamptz,
  order_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index credit_lots_user on public.credit_lots (user_id, expires_at);
-- The free credits are given once per account.
create unique index credit_lots_signup_once on public.credit_lots (user_id) where source = 'signup';
alter table public.credit_lots enable row level security;
create policy "own credit lots read" on public.credit_lots for select using (auth.uid() = user_id);
revoke insert, update, delete on public.credit_lots from anon, authenticated;

create table public.credit_spends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount int not null check (amount > 0),
  reason text not null,
  ref text,
  -- Which lots it came from, so a refund puts the credits back where they were: [{"lot": uuid, "n": int}].
  taken jsonb not null default '[]',
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index credit_spends_user on public.credit_spends (user_id, created_at desc);
alter table public.credit_spends enable row level security;
create policy "own credit spends read" on public.credit_spends for select using (auth.uid() = user_id);
revoke insert, update, delete on public.credit_spends from anon, authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('pro', 'pack')),
  pack_id text,
  credits int not null check (credits >= 0),
  amount_cents int not null check (amount_cents > 0),
  -- Pro only: this order carries the first-month bonus (checked when it was made, and again when it is paid).
  first_month_bonus boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'failed')),
  provider text,
  provider_ref text,
  -- Who is buying, for the first-month bonus check: a normalised email and hashes of the device and network.
  email_key text,
  device_hash text,
  ip_hash text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_user on public.orders (user_id, created_at desc);
create unique index orders_provider_ref on public.orders (provider, provider_ref) where provider_ref is not null;
alter table public.orders enable row level security;
create policy "own orders read" on public.orders for select using (auth.uid() = user_id);
revoke insert, update, delete on public.orders from anon, authenticated;

-- One first-month bonus per person: per account, per email, per device and per network.
create table public.bonus_claims (
  user_id uuid primary key references auth.users on delete cascade,
  email_key text not null unique,
  device_hash text,
  ip_hash text,
  order_id uuid,
  created_at timestamptz not null default now()
);
create index bonus_claims_device on public.bonus_claims (device_hash);
create index bonus_claims_ip on public.bonus_claims (ip_hash);
alter table public.bonus_claims enable row level security;
revoke all on public.bonus_claims from anon, authenticated;

-- Credits a person can spend now.
create function public.credit_balance(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.credit_lots
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
$$;

-- Takes p_amount credits, soonest-expiring first. Returns the spend's id, or null when there aren't enough.
create function public.spend_credits(p_user uuid, p_amount int, p_reason text, p_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  need int := p_amount;
  lot record;
  n int;
  taken jsonb := '[]';
  spend uuid;
begin
  if p_amount <= 0 then raise exception 'bad_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text)); -- two spends at once cannot both pass
  if public.credit_balance(p_user) < p_amount then return null; end if;
  for lot in
    select id, remaining from public.credit_lots
    where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at
    for update
  loop
    exit when need = 0;
    n := least(need, lot.remaining);
    update public.credit_lots set remaining = remaining - n where id = lot.id;
    taken := taken || jsonb_build_object('lot', lot.id, 'n', n);
    need := need - n;
  end loop;
  insert into public.credit_spends (user_id, amount, reason, ref, taken) values (p_user, p_amount, p_reason, p_ref, taken)
  returning id into spend;
  return spend;
end $$;

-- Gives a spend back, once. Returns false if it was already given back (or doesn't exist).
create function public.refund_credits(p_spend uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare s record; t jsonb;
begin
  update public.credit_spends set refunded_at = now() where id = p_spend and refunded_at is null returning * into s;
  if s.id is null then return false; end if;
  for t in select * from jsonb_array_elements(s.taken) loop
    update public.credit_lots set remaining = remaining + (t->>'n')::int where id = (t->>'lot')::uuid;
  end loop;
  return true;
end $$;

-- The free credits, once per account. Returns true if they were given now.
create function public.grant_signup_credits(p_user uuid, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into public.credit_lots (user_id, source, amount, remaining) values (p_user, 'signup', p_amount, p_amount)
  on conflict (user_id) where source = 'signup' do nothing
  returning id into v;
  return v is not null;
end $$;

-- Marks an order paid and delivers it, once: a pack adds credits that never expire; Pro adds 30 days and that month's
-- credits, which run out when the month does. The bonus is checked again here, so two orders can't both carry it.
-- Returns false if the order was already paid (a repeated webhook does nothing).
create function public.fulfill_order(p_order uuid, p_provider text, p_provider_ref text, p_days int, p_monthly int) returns boolean
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
        select 1 from public.bonus_claims b where b.user_id <> o.user_id
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

revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.spend_credits(uuid, int, text, text) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid) from public, anon, authenticated;
revoke all on function public.grant_signup_credits(uuid, int) from public, anon, authenticated;
revoke all on function public.fulfill_order(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.spend_credits(uuid, int, text, text) to service_role;
grant execute on function public.refund_credits(uuid) to service_role;
grant execute on function public.grant_signup_credits(uuid, int) to service_role;
grant execute on function public.fulfill_order(uuid, text, text, int, int) to service_role;

-- Free accounts get a daily cap on images made with credits too.
alter table public.daily_usage drop constraint if exists daily_usage_key_check;
alter table public.daily_usage add constraint daily_usage_key_check check (key in ('runs', 'likeness', 'images'));

-- Pro (the pass, or set by hand) has no character limit.
create or replace function public.enforce_character_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; n int;
begin
  -- A marketplace purchase is always allowed (as in 0015).
  if coalesce(current_setting('marketplace.trusted', true), '') = 'on' and new.purchased_from_listing_id is not null then
    return new;
  end if;
  select plan, is_admin, pro_until into p from public.profiles where id = new.user_id;
  if coalesce(p.is_admin, false) or p.plan = 'pro' or coalesce(p.pro_until > now(), false) then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select count(*) into n from public.characters where user_id = new.user_id;
  if n >= 1 then raise exception 'character_limit_reached'; end if;
  return new;
end $$;
