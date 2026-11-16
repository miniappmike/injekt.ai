-- The free plan's daily limits now reset at midnight in the person's own time zone. The app sends the zone name
-- (from the browser's clock) with every call; the default is Los Angeles for a person whose zone isn't known yet.
-- Replaces the 3-argument functions from 0012/0030 (a 4-argument version with a default would make calls ambiguous).
drop function if exists public.consume_daily(uuid, text, int);
drop function if exists public.release_daily(uuid, text);

create function public.consume_daily(p_user uuid, p_key text, p_limit int, p_tz text default 'America/Los_Angeles') returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_limit <= 0 then return false; end if;
  insert into public.daily_usage (user_id, day, key, count) values (p_user, (now() at time zone p_tz)::date, p_key, 1)
  on conflict (user_id, day, key) do update set count = public.daily_usage.count + 1
    where public.daily_usage.count < p_limit
  returning count into v;
  return v is not null;
end $$;

create function public.release_daily(p_user uuid, p_key text, p_tz text default 'America/Los_Angeles') returns void
language sql security definer set search_path = public as $$
  update public.daily_usage set count = greatest(count - 1, 0)
  where user_id = p_user and key = p_key and day = (now() at time zone p_tz)::date
$$;

revoke all on function public.consume_daily(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.release_daily(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_daily(uuid, text, int, text) to service_role;
grant execute on function public.release_daily(uuid, text, text) to service_role;
