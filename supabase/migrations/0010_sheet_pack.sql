-- The identity engine reads a character's reference sheets once into face and body crops plus her look in words
-- (the "sheet pack"), and saves it here so every generation reuses it. It is rebuilt when the sheets change.
alter table public.characters add column if not exists sheet_pack jsonb;

-- What a saved prompt needs to be generated again the same way (for Inject: what is in frame, the outfit, the short
-- photo-edit instruction and what it may change).
alter table public.prompt_history add column if not exists meta jsonb not null default '{}';

-- Likeness fix repaints the person in a generated image from her references.
alter table public.generations drop constraint if exists generations_kind_check;
alter table public.generations add constraint generations_kind_check
  check (kind in ('inject','direct_swap','edit','variant','carousel','face_fix','likeness_fix','reference_sheet'));
