-- Phase 5: live marketplace counts.
-- (a) marketplace_counts(): how many personas are available and sold, for anyone (even signed out).
-- (b) marketplace_pulse: one public row holding just those two numbers, kept current by a trigger and broadcast by
--     Realtime. The listings table itself is deliberately NOT in the Realtime publication: its rows hold the buyer,
--     the snapshot and the file paths, and none of that should ever ride a live feed. The page also re-asks every
--     30 seconds, which covers holds that run out without anything being written.

-- SECURITY DEFINER so the count is exact for everyone, and it returns two numbers only: nothing about any listing.
-- A reservation whose hold has run out counts as available, the same rule the public read policy uses.
create or replace function public.marketplace_counts()
returns table (available int, sold int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (count(*) filter (where status = 'available' or (status = 'reserved' and reserved_until <= now())))::int,
    (count(*) filter (where status = 'sold'))::int
  from public.marketplace_listings;
$$;

revoke all on function public.marketplace_counts() from public;
grant execute on function public.marketplace_counts() to anon, authenticated;

create table public.marketplace_pulse (
  id int primary key default 1 check (id = 1),
  available int not null default 0,
  sold int not null default 0,
  changed_at timestamptz not null default now()
);
alter table public.marketplace_pulse enable row level security;
create policy "pulse read" on public.marketplace_pulse for select to anon, authenticated using (true);
revoke all on public.marketplace_pulse from anon, authenticated;
grant select on public.marketplace_pulse to anon, authenticated;
insert into public.marketplace_pulse (id, available, sold) select 1, available, sold from public.marketplace_counts()
on conflict (id) do nothing;

-- Any listing change that could move the counts refreshes the pulse (only writing it when the numbers really change).
create function public.marketplace_pulse_refresh() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a int; s int;
begin
  select available, sold into a, s from public.marketplace_counts();
  update public.marketplace_pulse set available = a, sold = s, changed_at = now()
   where id = 1 and (available is distinct from a or sold is distinct from s);
  return null;
end $$;
revoke all on function public.marketplace_pulse_refresh() from public, anon, authenticated;
create trigger marketplace_pulse_refresh after insert or delete or update of status on public.marketplace_listings
  for each statement execute function public.marketplace_pulse_refresh();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_pulse'
     ) then
    alter publication supabase_realtime add table public.marketplace_pulse;
  end if;
end $$;
