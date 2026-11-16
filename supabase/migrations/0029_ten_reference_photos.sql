-- A character can now have up to 10 reference photos (was 5), including generated images pinned to her.
alter table public.characters drop constraint if exists characters_reference_paths_check;
alter table public.characters add constraint characters_reference_paths_check check (cardinality(reference_paths) <= 10);
