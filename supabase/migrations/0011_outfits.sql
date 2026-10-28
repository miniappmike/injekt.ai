-- Saved outfits: an extracted or written outfit description kept under a name, to reuse in Inject.
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.outfits enable row level security;
drop policy if exists "own outfits" on public.outfits;
create policy "own outfits" on public.outfits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists outfits_user_created on public.outfits (user_id, created_at desc);
