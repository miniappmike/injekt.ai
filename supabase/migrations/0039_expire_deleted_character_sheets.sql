-- Reference sheets never expire while their character exists (0033, src/lib/retention.ts), but once the
-- character is deleted they should go like any other image: 72 hours after the deletion.
-- generations.character_id is "on delete set null", so the sheets would otherwise be orphaned for 100 years.

-- 1. When a character is deleted, its generations that expire later than 72 hours from now get 72 hours.
create or replace function public.expire_character_generations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.generations
  set expires_at = now() + interval '72 hours'
  where character_id = old.id
    and expires_at > now() + interval '72 hours';
  return old;
end;
$$;

drop trigger if exists characters_expire_generations on public.characters;
create trigger characters_expire_generations
  before delete on public.characters
  for each row execute function public.expire_character_generations();

-- 2. Sheets of characters that were already deleted (character_id was cleared) get 72 hours from now.
--    Every sheet is made for a character, so a kept sheet with no character is an orphan.
update public.generations
set expires_at = now() + interval '72 hours'
where kind = 'reference_sheet'
  and character_id is null
  and output_path is not null
  and expires_at > now() + interval '72 hours';
