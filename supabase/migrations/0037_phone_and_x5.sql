-- X Reference now takes up to 5 images, and each character can have her own phone: a photo and/or a description that
-- the prompt writers use whenever a phone appears in the shot.
alter table public.characters drop constraint if exists characters_x_reference_paths_check;
alter table public.characters add constraint characters_x_reference_paths_check check (cardinality(x_reference_paths) <= 5);
alter table public.characters add column if not exists phone_description text check (phone_description is null or char_length(phone_description) <= 300);
alter table public.characters add column if not exists phone_photo_path text;
