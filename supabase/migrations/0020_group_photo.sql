-- Group photo: two to four of a person's characters together in one image (the characters are in params.group_ids).
alter table public.generations drop constraint if exists generations_kind_check;
alter table public.generations add constraint generations_kind_check
  check (kind in ('inject','direct_swap','edit','variant','carousel','face_fix','likeness_fix','reference_sheet','group_photo'));
