-- Persona Marketplace, phase 1: listings, their preview images, purchases, and the link from a bought character back to
-- its listing. Personas are fictional adults and exclusive: each listing sells once, to exactly one owner.
--
-- Who sees what:
--   * Anyone (signed in or not) reads listings that are available or sold, and their preview images.
--   * Only the buyer (sold_to) and admins read a listing's full assets (profile snapshot and full-resolution files), and
--     only through get_listing_assets() or the marketplace-assets bucket.
--   * Only admins write listings, prices and images.
--   * Purchases are written by purchase_persona() (phase 2), never directly.

-- True when the signed-in user is an admin. Definer, so policies can call it without reading profiles themselves.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  -- The admin's character it was listed from. Kept when that character is deleted, so a sale is never lost.
  source_character_id uuid references public.characters on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  -- Editable per listing while unsold. 50 cents is the smallest charge card processors accept.
  price_cents int not null check (price_cents between 50 and 10000000),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'available', 'reserved', 'sold', 'delisted')),
  reserved_by uuid references auth.users on delete set null,
  reserved_until timestamptz,
  -- The price at the moment of reservation: a price edit during checkout never changes what the buyer is charged.
  reserved_price_cents int check (reserved_price_cents between 50 and 10000000),
  sold_to uuid references auth.users on delete set null,
  sold_at timestamptz,
  published_at timestamptz,
  -- What the listing page shows: a short public description written in the marketplace profile builder.
  public_profile jsonb not null default '{}',
  -- What the buyer gets (never shown publicly): her full profile, notes and description from the profile build.
  profile_snapshot jsonb not null default '{}',
  -- Storage paths of the full-resolution files in the private marketplace-assets bucket:
  -- {"face_sheet": "...", "body_sheet": "...", "references": ["..."], "profile_photo": "..."}
  full_assets jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sold_has_buyer check (status <> 'sold' or (sold_to is not null and sold_at is not null)),
  constraint reserved_has_holder check (status <> 'reserved' or (reserved_by is not null and reserved_until is not null and reserved_price_cents is not null))
);
create index marketplace_listings_status on public.marketplace_listings (status, published_at desc);
alter table public.marketplace_listings enable row level security;

-- Rows: the public sees available and sold listings, and a reservation that has run out (it's for sale again).
-- Admins see every row.
create policy "public listings read" on public.marketplace_listings for select to anon, authenticated
  using (status in ('available', 'sold') or (status = 'reserved' and reserved_until <= now()) or public.is_admin());
create policy "admin listings insert" on public.marketplace_listings for insert to authenticated with check (public.is_admin());
create policy "admin listings update" on public.marketplace_listings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin listings delete" on public.marketplace_listings for delete to authenticated using (public.is_admin());

-- Columns: who reserved or bought a persona, where it came from, and what the buyer receives are never readable through
-- the API. The buyer gets the assets through get_listing_assets(); admin pages read them with the service role.
revoke all on public.marketplace_listings from anon, authenticated;
grant select (id, name, price_cents, currency, status, reserved_until, published_at, sold_at, public_profile, created_at, updated_at)
  on public.marketplace_listings to anon, authenticated;
grant insert, update, delete on public.marketplace_listings to authenticated;

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings on delete cascade,
  -- A watermarked, lower-resolution preview in the marketplace-previews bucket: <listing_id>/<file>.
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index listing_images_order on public.listing_images (listing_id, sort_order);
alter table public.listing_images enable row level security;
-- Visible exactly when its listing is (the listing's own policy decides).
create policy "public listing images read" on public.listing_images for select to anon, authenticated
  using (exists (select 1 from public.marketplace_listings l where l.id = listing_id));
create policy "admin listing images write" on public.listing_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.listing_images from anon, authenticated;
grant select on public.listing_images to anon, authenticated;
grant insert, update, delete on public.listing_images to authenticated;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  -- One purchase per listing, ever: the persona has exactly one owner.
  listing_id uuid not null unique references public.marketplace_listings on delete restrict,
  buyer_id uuid not null references auth.users on delete restrict,
  -- 'stripe' today; any lowercase name later (crypto gateway), with no change here.
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  -- The payment's id at the provider. Unique, so a replayed webhook can never record a second purchase.
  provider_payment_id text not null unique check (char_length(provider_payment_id) between 1 and 255),
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index purchases_buyer on public.purchases (buyer_id, created_at desc);
alter table public.purchases enable row level security;
create policy "own purchases read" on public.purchases for select to authenticated using (buyer_id = auth.uid() or public.is_admin());
-- No write grants: rows are only written by purchase_persona() (phase 2), which runs as its owner.
revoke all on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;

-- A character bought on the marketplace remembers its listing.
alter table public.characters add column purchased_from_listing_id uuid references public.marketplace_listings on delete set null;
create unique index characters_purchased_from_listing on public.characters (purchased_from_listing_id) where purchased_from_listing_id is not null;

-- Rules that hold however a row is changed. The purchase and reservation functions (later phases) set
-- marketplace.trusted for their own transaction to make the moves only they may make.
create function public.marketplace_listing_guard() returns trigger
language plpgsql set search_path = public as $$
declare trusted boolean := coalesce(current_setting('marketplace.trusted', true), '') = 'on';
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'available') and not trusted then
      raise exception 'listing_status_not_allowed' using errcode = 'check_violation';
    end if;
    if new.status = 'available' and new.published_at is null then new.published_at := now(); end if;
    return new;
  end if;

  -- A sold persona belongs to its buyer: nothing about it changes outside the trusted functions.
  if old.status = 'sold' and not trusted then
    raise exception 'listing_sold' using errcode = 'check_violation';
  end if;
  -- Only the purchase and reservation functions reserve, sell, or record who holds or bought a listing.
  if not trusted and (
       (new.status in ('reserved', 'sold') and new.status is distinct from old.status)
       or new.reserved_by is distinct from old.reserved_by
       or new.reserved_until is distinct from old.reserved_until
       or new.reserved_price_cents is distinct from old.reserved_price_cents
       or new.sold_to is distinct from old.sold_to
       or new.sold_at is distinct from old.sold_at) then
    raise exception 'listing_transition_not_allowed' using errcode = 'check_violation';
  end if;
  -- A listing someone is paying for can't be pulled from under them.
  if new.status = 'delisted' and old.status = 'reserved' and old.reserved_until > now() and not trusted then
    raise exception 'listing_reserved' using errcode = 'check_violation';
  end if;
  -- Leaving an expired reservation clears it.
  if old.status = 'reserved' and new.status in ('available', 'delisted', 'draft') then
    new.reserved_by := null; new.reserved_until := null; new.reserved_price_cents := null;
  end if;
  if new.status = 'available' and old.status is distinct from 'available' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
revoke all on function public.marketplace_listing_guard() from public, anon, authenticated;
create trigger marketplace_listing_guard before insert or update on public.marketplace_listings
  for each row execute function public.marketplace_listing_guard();

-- Sold listings are kept forever (they back a purchase); admins can delete drafts and delisted ones only.
create function public.marketplace_listing_delete_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status in ('reserved', 'sold') then raise exception 'listing_not_deletable' using errcode = 'check_violation'; end if;
  return old;
end $$;
revoke all on function public.marketplace_listing_delete_guard() from public, anon, authenticated;
create trigger marketplace_listing_delete_guard before delete on public.marketplace_listings
  for each row execute function public.marketplace_listing_delete_guard();

-- Owners edit their characters freely, but can't claim one came from a listing.
create function public.characters_listing_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.purchased_from_listing_id is distinct from (case when tg_op = 'UPDATE' then old.purchased_from_listing_id end)
     and coalesce(current_setting('marketplace.trusted', true), '') <> 'on' then
    raise exception 'purchased_from_listing_id_locked' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.characters_listing_guard() from public, anon, authenticated;
create trigger characters_listing_guard before insert or update of purchased_from_listing_id on public.characters
  for each row execute function public.characters_listing_guard();

-- The buyer (or an admin) reads what the listing delivers. Everyone else gets nothing.
create function public.get_listing_assets(p_listing uuid)
returns table (profile_snapshot jsonb, full_assets jsonb)
language sql stable security definer set search_path = public as $$
  select l.profile_snapshot, l.full_assets from public.marketplace_listings l
  where l.id = p_listing and ((l.status = 'sold' and l.sold_to = auth.uid()) or public.is_admin())
$$;
revoke all on function public.get_listing_assets(uuid) from public, anon, authenticated;
grant execute on function public.get_listing_assets(uuid) to authenticated, service_role;

-- For the storage policies: is this listing public, and does the signed-in user own it?
create function public.listing_is_public(p_listing text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.marketplace_listings l where l.id::text = p_listing
    and (l.status in ('available', 'sold') or (l.status = 'reserved' and l.reserved_until <= now())))
$$;
create function public.owns_listing(p_listing text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.marketplace_listings l where l.id::text = p_listing and l.status = 'sold' and l.sold_to = auth.uid())
$$;
revoke all on function public.listing_is_public(text) from public, anon, authenticated;
revoke all on function public.owns_listing(text) from public, anon, authenticated;
grant execute on function public.listing_is_public(text) to anon, authenticated, service_role;
grant execute on function public.owns_listing(text) to authenticated, service_role;

-- Storage. Both buckets are private and every path starts with the listing id: <listing_id>/<file>.
--   marketplace-previews: watermarked, lower-resolution images, readable while the listing is public.
--   marketplace-assets:   full-resolution sheets and photos, readable by the buyer and admins only.
-- Only admins upload (the server uses the service role, which bypasses these).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('marketplace-previews', 'marketplace-previews', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('marketplace-assets', 'marketplace-assets', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "marketplace previews read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'marketplace-previews' and (public.listing_is_public((storage.foldername(name))[1]) or public.is_admin()));
create policy "marketplace assets read" on storage.objects for select to authenticated
  using (bucket_id = 'marketplace-assets' and (public.owns_listing((storage.foldername(name))[1]) or public.is_admin()));
create policy "marketplace admin write" on storage.objects for insert to authenticated
  with check (bucket_id in ('marketplace-previews', 'marketplace-assets') and public.is_admin());
create policy "marketplace admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('marketplace-previews', 'marketplace-assets') and public.is_admin());
