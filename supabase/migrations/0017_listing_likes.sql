-- Hearts on marketplace personas. Anyone can heart a public persona (available or sold), once each:
--   * signed in: once per account   (liker = 'u:<user id>')
--   * signed out: once per browser  (liker = 'v:<random visitor id kept in a private cookie>')
-- Only the server writes hearts (through toggle_listing_like, after rate limiting); everyone can read the counts.

create table public.listing_likes (
  listing_id uuid not null references public.marketplace_listings on delete cascade,
  liker text not null check (liker ~ '^(u|v):[0-9a-f-]{36}$'),
  created_at timestamptz not null default now(),
  primary key (listing_id, liker)
);
alter table public.listing_likes enable row level security;
-- No policies and no grants: nobody reads or writes the rows (or learns who liked what) through the API.
revoke all on public.listing_likes from anon, authenticated;

-- Hearts the persona if the liker hasn't, takes it back if they have. Returns the new state and count.
-- Only for personas the public can see; drafts and delisted ones can't be hearted.
create function public.toggle_listing_like(p_listing uuid, p_liker text)
returns table (liked boolean, likes int)
language plpgsql security definer set search_path = public as $$
declare removed int;
begin
  if p_liker is null or p_liker !~ '^(u|v):[0-9a-f-]{36}$' then
    raise exception 'like_bad_liker' using errcode = 'invalid_parameter_value';
  end if;
  if not public.listing_is_public(p_listing::text) then
    raise exception 'like_not_public' using errcode = 'check_violation';
  end if;
  delete from public.listing_likes where listing_id = p_listing and liker = p_liker;
  get diagnostics removed = row_count;
  if removed = 0 then
    insert into public.listing_likes (listing_id, liker) values (p_listing, p_liker) on conflict do nothing;
  end if;
  return query select removed = 0, (select count(*)::int from public.listing_likes where listing_id = p_listing);
end $$;
revoke all on function public.toggle_listing_like(uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_listing_like(uuid, text) to service_role;

-- Heart counts for public personas, and which of them this liker has hearted (for the filled heart).
create function public.listing_like_counts(p_listings uuid[], p_liker text default null)
returns table (listing_id uuid, likes int, liked boolean)
language sql stable security definer set search_path = public as $$
  select l.id,
         (select count(*)::int from public.listing_likes k where k.listing_id = l.id),
         p_liker is not null and exists (select 1 from public.listing_likes k where k.listing_id = l.id and k.liker = p_liker)
  from public.marketplace_listings l
  where l.id = any (p_listings)
    and (l.status in ('available', 'sold') or (l.status = 'reserved' and l.reserved_until <= now()))
$$;
revoke all on function public.listing_like_counts(uuid[], text) from public, anon, authenticated;
-- Counts are public, but "has this liker hearted it" is only asked by the server, which knows who is asking.
grant execute on function public.listing_like_counts(uuid[], text) to service_role;
