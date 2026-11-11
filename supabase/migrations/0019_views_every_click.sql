-- Views count every click on a persona's page (the owner's decision: opening her page is a view, every time).
-- 0018 counted one view per person per day; this keeps every visit as its own row. The server still rate limits views
-- per person (60 a minute), so a script can't inflate a persona's Virality Rank.

alter table public.listing_views drop constraint listing_views_pkey;
alter table public.listing_views add column id bigint generated always as identity primary key;
alter table public.listing_views add column viewed_at timestamptz not null default now();

create or replace function public.record_listing_view(p_listing uuid, p_viewer text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_viewer is null or p_viewer !~ '^(u|v):[0-9a-f-]{36}$' then
    raise exception 'view_bad_viewer' using errcode = 'invalid_parameter_value';
  end if;
  if not public.listing_is_public(p_listing::text) then return; end if;
  insert into public.listing_views (listing_id, viewer) values (p_listing, p_viewer);
end $$;
revoke all on function public.record_listing_view(uuid, text) from public, anon, authenticated;
grant execute on function public.record_listing_view(uuid, text) to service_role;
