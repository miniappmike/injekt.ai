-- UGC: a character shown with a product, from the product's photos (the UGC page).
alter table public.generations drop constraint if exists generations_kind_check;
alter table public.generations add constraint generations_kind_check
  check (kind in ('inject','direct_swap','edit','variant','carousel','face_fix','likeness_fix','reference_sheet','group_photo','art_to_real','ugc'));
