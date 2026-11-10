-- Persona Marketplace, phase 2: the atomic purchase.
--
-- purchase_persona() is the only way a listing becomes sold. In one transaction it:
--   1. locks the listing row (FOR UPDATE), so two payments for the same persona are handled one after the other;
--   2. returns the earlier result if this provider payment was already recorded (webhook replays are harmless);
--   3. checks the listing can be sold to this buyer: available, reserved by this buyer, or reserved by someone else
--      whose hold has run out;
--   4. optionally checks the amount paid matches the price (the reserved price, if this buyer holds it);
--   5. marks the listing sold, records the purchase, and creates the buyer's own character from the snapshot, with new
--      storage paths in their folder.
--
-- Files can't be copied inside a database transaction (they live in object storage), so the function writes the copy
-- plan onto the purchase (asset_copies), and the server copies the files right after and stamps assets_copied_at. The
-- plan is fixed, so copying is safe to retry until it's done.
--
-- Provider-agnostic: the function knows nothing about Stripe. The caller verifies the payment first (webhook signature)
-- and passes the provider's name and payment id.

alter table public.purchases add column asset_copies jsonb not null default '[]';
alter table public.purchases add column assets_copied_at timestamptz;
alter table public.purchases add column character_id uuid references public.characters on delete set null;

-- A bought persona is the buyer's even on the free plan, where a second character is otherwise refused. Only the trusted
-- purchase transaction can skip the limit (the flag can't be set through the API: it's a server-side setting, and
-- characters_listing_guard stops anyone else from writing purchased_from_listing_id).
create or replace function public.enforce_character_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; n int;
begin
  if coalesce(current_setting('marketplace.trusted', true), '') = 'on' and new.purchased_from_listing_id is not null then
    return new;
  end if;
  select plan, is_admin into p from public.profiles where id = new.user_id;
  if coalesce(p.is_admin, false) or p.plan = 'pro' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text)); -- two simultaneous inserts cannot both pass
  select count(*) into n from public.characters where user_id = new.user_id;
  if n >= 1 then raise exception 'character_limit_reached'; end if;
  return new;
end $$;

-- The new path for one copied file: <buyer>/characters/<character>/<name>.<ext of the original>.
create function public.marketplace_copy_path(p_buyer uuid, p_character uuid, p_name text, p_from text) returns text
language sql immutable set search_path = public as $$
  select p_buyer::text || '/characters/' || p_character::text || '/' || p_name || '.'
    || coalesce(nullif(lower(substring(p_from from '\.([A-Za-z0-9]{2,5})$')), ''), 'jpg')
$$;
revoke all on function public.marketplace_copy_path(uuid, uuid, text, text) from public, anon, authenticated;

create function public.purchase_persona(
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
      exit when i >= 3; -- characters hold up to 3 reference photos
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

-- Only the server calls this, after verifying the payment with the provider.
revoke all on function public.purchase_persona(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.purchase_persona(uuid, uuid, text, text, int) to service_role;
