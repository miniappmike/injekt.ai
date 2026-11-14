-- Pin It past the limit now rotates through her reference photos (1st, 2nd, ... 5th, then the 1st again).
-- `pin_cursor` is the slot (0-based) the next replacement takes. Until this is run, pinning replaces photo 1 every time.
alter table public.characters add column if not exists pin_cursor smallint not null default 0;
