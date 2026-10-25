-- Variants and Carousel can take up to 2 extra images (vibe, outfit) after the main one. A saved prompt keeps them so
-- generating it again from History sends the same images in the same order.
alter table public.prompt_history
  add column if not exists extra_image_paths text[] not null default '{}'
  check (cardinality(extra_image_paths) <= 2);
