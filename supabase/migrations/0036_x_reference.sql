-- "X Reference" on a character's page: up to 3 extra images. A placeholder for now: they are saved and shown, but no
-- prompt or generation reads them yet.
alter table public.characters add column if not exists x_reference_paths text[] not null default '{}';
alter table public.characters drop constraint if exists characters_x_reference_paths_check;
alter table public.characters add constraint characters_x_reference_paths_check check (cardinality(x_reference_paths) <= 3);
