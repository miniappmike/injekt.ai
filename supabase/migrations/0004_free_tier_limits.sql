-- Free-tier limits. Plan changes and counters are server-only (service role); users can only read.

alter table public.profiles add column plan text not null default 'free' check (plan in ('free', 'pro'));
-- profiles has no update policy for users, so nobody can promote themselves from the browser.

create table public.usage_counters (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, key)
);
alter table public.usage_counters enable row level security;
create policy "own counters read" on public.usage_counters for select using (auth.uid() = user_id);

-- Atomically uses one unit of a lifetime allowance. Returns false when the limit is reached.
create function public.consume_allowance(p_user uuid, p_key text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_limit <= 0 then return false; end if;
  insert into public.usage_counters (user_id, key, count) values (p_user, p_key, 1)
  on conflict (user_id, key) do update set count = public.usage_counters.count + 1
    where public.usage_counters.count < p_limit
  returning count into v;
  return v is not null;
end $$;

-- Gives one unit back, for example when the provider failed before doing any work.
create function public.release_allowance(p_user uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  update public.usage_counters set count = greatest(count - 1, 0) where user_id = p_user and key = p_key
$$;

-- Callable only by the server. If users could call these they could reset their own limits.
revoke all on function public.consume_allowance(uuid, text, int) from public, anon, authenticated;
revoke all on function public.release_allowance(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_allowance(uuid, text, int) to service_role;
grant execute on function public.release_allowance(uuid, text) to service_role;

-- Free plan: 1 character at a time. Enforced here so it holds no matter which code path inserts.
create function public.enforce_character_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; n int;
begin
  select plan, is_admin into p from public.profiles where id = new.user_id;
  if coalesce(p.is_admin, false) or p.plan = 'pro' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text)); -- two simultaneous inserts cannot both pass
  select count(*) into n from public.characters where user_id = new.user_id;
  if n >= 1 then raise exception 'character_limit_reached'; end if;
  return new;
end $$;

create trigger characters_free_limit before insert on public.characters
  for each row execute function public.enforce_character_limit();
