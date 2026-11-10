-- Views and the Virality Rank on marketplace personas.
--   * A view is one person opening a persona's page, counted at most once per day per person (signed in: per account;
--     signed out: per browser, the same visitor id the hearts use), so refreshing doesn't inflate it.
--   * Virality Rank orders the personas still for sale by views + likes, highest first (#1, #2, ...). Sold personas
--     have no rank. Ties go to the one listed earlier.
-- Only the server records views; anyone can read the numbers.

create table public.listing_views (
  listing_id uuid not null references public.marketplace_listings on delete cascade,
  viewer text not null check (viewer ~ '^(u|v):[0-9a-f-]{36}$'),
  day date not null default (now() at time zone 'utc')::date,
  primary key (listing_id, viewer, day)
);
create index listing_views_listing on public.listing_views (listing_id);
alter table public.listing_views enable row level security;
-- No policies and no grants: who viewed what is never readable through the API.
revoke all on public.listing_views from anon, authenticated;

-- Records one view (ignored if this person already viewed it today, or the persona isn't public).
create function public.record_listing_view(p_listing uuid, p_viewer text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_viewer is null or p_viewer !~ '^(u|v):[0-9a-f-]{36}$' then
    raise exception 'view_bad_viewer' using errcode = 'invalid_parameter_value';
  end if;
  if not public.listing_is_public(p_listing::text) then return; end if;
  insert into public.listing_views (listing_id, viewer) values (p_listing, p_viewer) on conflict do nothing;
end $$;
revoke all on function public.record_listing_view(uuid, text) from public, anon, authenticated;
grant execute on function public.record_listing_view(uuid, text) to service_role;

-- Views, likes and rank for public personas (all of them, or just the ids given).
create function public.listing_stats(p_listings uuid[] default null)
returns table (listing_id uuid, views int, likes int, rank int)
language sql stable security definer set search_path = public as $$
  with pub as (
    select l.id, l.status, l.published_at from public.marketplace_listings l
    where l.status in ('available', 'sold') or (l.status = 'reserved' and l.reserved_until <= now())
  ),
  v as (select listing_id, count(*) as n from public.listing_views group by listing_id),
  k as (select listing_id, count(*) as n from public.listing_likes group by listing_id),
  s as (
    select p.id, p.status, p.published_at, coalesce(v.n, 0)::int as views, coalesce(k.n, 0)::int as likes
    from pub p left join v on v.listing_id = p.id left join k on k.listing_id = p.id
  ),
  r as (
    select id, row_number() over (order by views + likes desc, published_at asc nulls last, id)::int as rank
    from s where status <> 'sold'
  )
  select s.id, s.views, s.likes, r.rank
  from s left join r on r.id = s.id
  where p_listings is null or s.id = any (p_listings)
$$;
revoke all on function public.listing_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.listing_stats(uuid[]) to anon, authenticated, service_role;
