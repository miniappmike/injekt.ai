-- Custom order on the Characters page: lower numbers come first. NULL (never arranged, e.g. a new character) sorts
-- ahead of arranged ones, newest first. Rows are only written by their owner (existing "own characters" policy).
alter table public.characters add column if not exists sort_order int;
