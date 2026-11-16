-- The free plan's daily limits now reset at midnight Pacific time (America/Los_Angeles) instead of midnight UTC.
-- Rows already written keep their UTC date; they only matter for the day they were made on.
alter table public.daily_usage alter column day set default (now() at time zone 'America/Los_Angeles')::date;

create or replace function public.consume_daily(p_user uuid, p_key text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_limit <= 0 then return false; end if;
  insert into public.daily_usage (user_id, day, key, count) values (p_user, (now() at time zone 'America/Los_Angeles')::date, p_key, 1)
  on conflict (user_id, day, key) do update set count = public.daily_usage.count + 1
    where public.daily_usage.count < p_limit
  returning count into v;
  return v is not null;
end $$;

create or replace function public.release_daily(p_user uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  update public.daily_usage set count = greatest(count - 1, 0)
  where user_id = p_user and key = p_key and day = (now() at time zone 'America/Los_Angeles')::date
$$;
