-- A person's time zone for their daily limits: saved the first time the app sees their browser's zone, and then fixed,
-- so changing the browser's zone can't reset the allowance early. (Changing it later is done here in the SQL editor.)
alter table public.profiles add column if not exists timezone text;

create or replace function public.keep_profile_timezone() returns trigger
language plpgsql as $$
begin
  if old.timezone is not null and new.timezone is distinct from old.timezone and current_user in ('authenticated', 'anon') then
    raise exception 'Your time zone is fixed once it is set.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_keep_timezone on public.profiles;
create trigger profiles_keep_timezone before update on public.profiles for each row execute function public.keep_profile_timezone();
