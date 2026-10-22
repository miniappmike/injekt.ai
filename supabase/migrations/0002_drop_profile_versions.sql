-- Profile version history was dropped from the product. Safe to run more than once.
drop table if exists public.character_profile_versions;
alter table public.characters drop column if exists profile_version;
alter table public.generations drop column if exists character_version;
