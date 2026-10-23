-- Saved prompts and reports (the app keeps the newest 100 per user).
create table public.prompt_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  character_id uuid references public.characters on delete set null,
  kind text not null check (kind in ('inject', 'likeness', 'variant', 'carousel')),
  label text not null,
  prompt text not null,
  -- thumbnail: an object in the character-media bucket, owned by the same user
  image_path text,
  created_at timestamptz not null default now()
);
alter table public.prompt_history enable row level security;
create policy "own history" on public.prompt_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.prompt_history (user_id, created_at desc);
