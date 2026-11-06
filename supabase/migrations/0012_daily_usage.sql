-- Daily allowances for the prompt tools, paid for by the platform's AI key: prompt runs and likeness checks per day.
-- One row per person, day (UTC) and kind. Only the server changes them; a person can read their own.
create table public.daily_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  key text not null check (key in ('runs', 'likeness')),
  count int not null default 0 check (count >= 0),
  primary key (user_id, day, key)
);
alter table public.daily_usage enable row level security;
create policy "own daily usage read" on public.daily_usage for select using (auth.uid() = user_id);
revoke insert, update, delete on public.daily_usage from anon, authenticated;

-- Uses one unit of today's allowance. Returns false when today's limit is reached. Atomic, so two runs at once
-- cannot both slip past the limit.
create function public.consume_daily(p_user uuid, p_key text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_limit <= 0 then return false; end if;
  insert into public.daily_usage (user_id, day, key, count) values (p_user, (now() at time zone 'utc')::date, p_key, 1)
  on conflict (user_id, day, key) do update set count = public.daily_usage.count + 1
    where public.daily_usage.count < p_limit
  returning count into v;
  return v is not null;
end $$;

-- Gives one unit back, when the AI call failed and nothing was delivered.
create function public.release_daily(p_user uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  update public.daily_usage set count = greatest(count - 1, 0)
  where user_id = p_user and key = p_key and day = (now() at time zone 'utc')::date
$$;

revoke all on function public.consume_daily(uuid, text, int) from public, anon, authenticated;
revoke all on function public.release_daily(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_daily(uuid, text, int) to service_role;
grant execute on function public.release_daily(uuid, text) to service_role;
