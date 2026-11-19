-- Persona checkout through Telegram Stars and NOWPayments (owner, November 2026).
--
-- 1. Orders can now be for a marketplace persona: kind 'persona', with the listing it is for. Its price is the
--    listing's price when checkout started, and it gives no credits. The sale itself is still purchase_persona (0015),
--    called by the server once the payment is confirmed.
-- 2. reserve_persona() holds a listing for one buyer while they pay (15 minutes from the site), so nobody else can buy
--    her in that time. release_persona() lets the buyer give the hold up. Both are the only ways (with
--    purchase_persona) to change a reservation: they run as "trusted" for marketplace_listing_guard.
-- 3. purchase_persona copies up to 10 reference photos (characters can have 10 now, not 3).
-- 4. fulfill_order refuses persona orders, so one can never be delivered as Pro by mistake (for example Mark paid).

alter table public.orders drop constraint if exists orders_kind_check;
alter table public.orders add constraint orders_kind_check check (kind in ('pro', 'pack', 'persona'));
alter table public.orders add column if not exists listing_id uuid references public.marketplace_listings on delete set null;
create index if not exists orders_listing on public.orders (listing_id) where listing_id is not null;

create or replace function public.reserve_persona(p_listing uuid, p_buyer uuid, p_minutes int default 15)
returns table (outcome text, held_until timestamptz, price_cents int)
language plpgsql security definer set search_path = public as $$
declare l public.marketplace_listings%rowtype;
begin
  if p_listing is null or p_buyer is null or coalesce(p_minutes, 0) < 1 or p_minutes > 60 then
    raise exception 'reserve_bad_arguments' using errcode = 'invalid_parameter_value';
  end if;
  select * into l from public.marketplace_listings where id = p_listing for update;
  if not found then return query select 'not_found'::text, null::timestamptz, null::int; return; end if;
  if l.status = 'sold' then return query select 'sold'::text, null::timestamptz, null::int; return; end if;
  -- This buyer already holds her: keep the hold as it is (starting checkout again doesn't make it longer).
  if l.status = 'reserved' and l.reserved_by = p_buyer and l.reserved_until > now() then
    return query select 'held'::text, l.reserved_until, l.reserved_price_cents; return;
  end if;
  if l.status = 'reserved' and l.reserved_until > now() then
    return query select 'held_by_someone_else'::text, l.reserved_until, null::int; return;
  end if;
  if l.status not in ('available', 'reserved') then
    return query select 'unavailable'::text, null::timestamptz, null::int; return;
  end if;
  perform set_config('marketplace.trusted', 'on', true);
  update public.marketplace_listings
     set status = 'reserved', reserved_by = p_buyer, reserved_until = now() + make_interval(mins => p_minutes),
         reserved_price_cents = l.price_cents
   where id = p_listing
  returning reserved_until into l.reserved_until;
  return query select 'held'::text, l.reserved_until, l.price_cents;
end $$;

create or replace function public.release_persona(p_listing uuid, p_buyer uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare l public.marketplace_listings%rowtype;
begin
  select * into l from public.marketplace_listings where id = p_listing for update;
  if not found or l.status <> 'reserved' or l.reserved_by is distinct from p_buyer then return false; end if;
  perform set_config('marketplace.trusted', 'on', true);
  update public.marketplace_listings set status = 'available', reserved_by = null, reserved_until = null, reserved_price_cents = null
   where id = p_listing;
  return true;
end $$;

revoke all on function public.reserve_persona(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.release_persona(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_persona(uuid, uuid, int) to service_role;
grant execute on function public.release_persona(uuid, uuid) to service_role;

-- purchase_persona, unchanged from 0015 except that it copies up to 10 reference photos.
create or replace function public.purchase_persona(
  p_listing uuid,
  p_buyer uuid,
  p_provider text,
  p_payment_id text,
  -- What the provider says was paid. When given, it must match the price, or nothing is sold.
  p_amount_cents int default null
)
returns table (outcome text, purchase_id uuid, character_id uuid, amount_cents int)
language plpgsql security definer set search_path = public as $$
declare
  l public.marketplace_listings%rowtype;
  prior public.purchases%rowtype;
  price int;
  snap jsonb;
  assets jsonb;
  new_character uuid := gen_random_uuid();
  new_purchase uuid := gen_random_uuid();
  copies jsonb := '[]';
  face text; body text; photo text; refs text[] := '{}';
  ref text; i int := 0;
begin
  if p_listing is null or p_buyer is null or coalesce(p_provider, '') = '' or coalesce(p_payment_id, '') = '' then
    raise exception 'purchase_bad_arguments' using errcode = 'invalid_parameter_value';
  end if;

  -- 1. One payment at a time per listing. Everything below sees the row as it is now.
  select * into l from public.marketplace_listings where id = p_listing for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid, null::int; return;
  end if;

  -- 2. The same payment again (a replayed or duplicated webhook): report what was recorded the first time.
  select * into prior from public.purchases where provider_payment_id = p_payment_id;
  if found then
    if prior.listing_id <> p_listing or prior.buyer_id <> p_buyer or prior.provider <> p_provider then
      raise exception 'purchase_payment_id_reused' using errcode = 'unique_violation';
    end if;
    return query select 'already_recorded'::text, prior.id, prior.character_id, prior.amount_cents; return;
  end if;

  -- 3. Can this buyer have it?
  if l.status = 'sold' then
    return query select 'sold'::text, null::uuid, null::uuid, null::int; return;
  end if;
  if not (
    l.status = 'available'
    or (l.status = 'reserved' and (l.reserved_by = p_buyer or l.reserved_until <= now()))
  ) then
    -- Draft, delisted, or someone else is paying for it right now.
    return query select 'unavailable'::text, null::uuid, null::uuid, null::int; return;
  end if;

  -- 4. The price: the one the buyer reserved at, if they hold the reservation; otherwise today's price.
  price := case when l.status = 'reserved' and l.reserved_by = p_buyer then l.reserved_price_cents else l.price_cents end;
  if p_amount_cents is not null and p_amount_cents <> price then
    return query select 'amount_mismatch'::text, null::uuid, null::uuid, price; return;
  end if;

  -- 5. Sell it, record it, and give the buyer their own character.
  perform set_config('marketplace.trusted', 'on', true);

  update public.marketplace_listings
     set status = 'sold', sold_to = p_buyer, sold_at = now(),
         reserved_by = null, reserved_until = null, reserved_price_cents = null
   where id = p_listing;

  snap := coalesce(l.profile_snapshot, '{}');
  assets := coalesce(l.full_assets, '{}');

  -- The copy plan: every full-resolution file, from the listing's private folder to a new path in the buyer's.
  if coalesce(assets->>'face_sheet', '') <> '' then
    face := public.marketplace_copy_path(p_buyer, new_character, 'face-sheet', assets->>'face_sheet');
    copies := copies || jsonb_build_object('from_bucket', 'marketplace-assets', 'from', assets->>'face_sheet', 'to_bucket', 'character-media', 'to', face);
  end if;
  if coalesce(assets->>'body_sheet', '') <> '' then
    body := public.marketplace_copy_path(p_buyer, new_character, 'body-sheet', assets->>'body_sheet');
    copies := copies || jsonb_build_object('from_bucket', 'marketplace-assets', 'from', assets->>'body_sheet', 'to_bucket', 'character-media', 'to', body);
  end if;
  if coalesce(assets->>'profile_photo', '') <> '' then
    photo := public.marketplace_copy_path(p_buyer, new_character, 'profile', assets->>'profile_photo');
    copies := copies || jsonb_build_object('from_bucket', 'marketplace-assets', 'from', assets->>'profile_photo', 'to_bucket', 'character-media', 'to', photo);
  end if;
  if jsonb_typeof(assets->'references') = 'array' then
    for ref in select jsonb_array_elements_text(assets->'references') loop
      exit when i >= 10; -- characters hold up to 10 reference photos (MAX_REFERENCE_PHOTOS)
      i := i + 1;
      refs := refs || public.marketplace_copy_path(p_buyer, new_character, 'reference-' || i, ref);
      copies := copies || jsonb_build_object('from_bucket', 'marketplace-assets', 'from', ref, 'to_bucket', 'character-media', 'to', refs[i]);
    end loop;
  end if;

  insert into public.characters (
    id, user_id, name, lore, always_keep, height, weight, profile,
    profile_photo_path, face_sheet_path, body_sheet_path, reference_paths,
    provenance_attested_at, purchased_from_listing_id
  ) values (
    new_character, p_buyer, l.name,
    nullif(snap->>'lore', ''), nullif(snap->>'always_keep', ''), nullif(snap->>'height', ''), nullif(snap->>'weight', ''),
    case when jsonb_typeof(snap->'profile') = 'object' then snap->'profile' else '{}'::jsonb end,
    photo, face, body, refs,
    -- A marketplace persona is an invented character, sold with the rights to use it.
    now(), p_listing
  );

  insert into public.purchases (id, listing_id, buyer_id, provider, provider_payment_id, amount_cents, asset_copies, character_id)
  values (new_purchase, p_listing, p_buyer, p_provider, p_payment_id, price, copies, new_character);

  return query select 'purchased'::text, new_purchase, new_character, price;
end $$;

revoke all on function public.purchase_persona(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.purchase_persona(uuid, uuid, text, text, int) to service_role;

-- fulfill_order, as in 0024, refusing persona orders.
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
  -- A persona is sold by purchase_persona (the server calls it); this function only delivers Pro and token packs.
  if o.kind = 'persona' then raise exception 'persona_order_not_fulfillable_here'; end if;
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
