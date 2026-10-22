-- Injekt.ai foundation schema. Every table has RLS on.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Users can read their own row. No update policy: is_admin is only changed with the service role.
create policy "own profile read" on public.profiles for select using (auth.uid() = id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  default_image_provider text,
  default_vision_provider text,
  default_llm_provider text,
  prefs jsonb not null default '{}'
);
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Encrypted BYOK keys. No policies on purpose: only the service role (server) can read ciphertext.
create table public.user_api_keys (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  kind text not null check (kind in ('image','vision','llm')),
  ciphertext text not null,
  last4 text not null,
  key_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider, kind)
);
alter table public.user_api_keys enable row level security;

-- Safe metadata for the settings screen (never returns ciphertext).
create function public.list_my_api_keys()
returns table (provider text, kind text, last4 text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select provider, kind, last4, created_at from public.user_api_keys where user_id = auth.uid()
$$;

create function public.delete_my_api_key(p_provider text, p_kind text) returns void
language sql security definer set search_path = public as $$
  delete from public.user_api_keys where user_id = auth.uid() and provider = p_provider and kind = p_kind
$$;

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  lore text,
  always_keep text,
  height text,
  weight text,
  profile jsonb not null default '{}',
  profile_version int not null default 1,
  profile_photo_path text,
  face_sheet_path text,
  body_sheet_path text,
  reference_paths text[] not null default '{}' check (cardinality(reference_paths) <= 3),
  -- user confirmed they own/licensed the references or the character is invented
  provenance_attested_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.characters enable row level security;
create policy "own characters" on public.characters for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.character_profile_versions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  version int not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  unique (character_id, version)
);
alter table public.character_profile_versions enable row level security;
create policy "own profile versions" on public.character_profile_versions for all
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

create type public.generation_status as enum ('pending','processing','complete','failed');

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  character_id uuid references public.characters on delete set null,
  character_version int,
  kind text not null check (kind in ('inject','direct_swap','edit','variant','carousel','face_fix','reference_sheet')),
  status public.generation_status not null default 'pending',
  provider text not null,
  provider_job_id text,
  model text,
  prompt text,
  params jsonb not null default '{}', -- never store API keys here
  seed bigint,
  output_path text,
  error text,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (provider, provider_job_id)
);
alter table public.generations enable row level security;
create policy "own generations read" on public.generations for select using (auth.uid() = user_id);
create policy "own generations insert" on public.generations for insert with check (auth.uid() = user_id);
-- updates come from the server (service role) only
create index on public.generations (user_id, created_at desc);

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  generation_id uuid references public.generations on delete set null,
  provider text not null,
  key_source text not null check (key_source in ('byok','server')),
  cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.usage_ledger enable row level security;
create policy "own ledger read" on public.usage_ledger for select using (auth.uid() = user_id);
create index on public.usage_ledger (user_id, created_at desc);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users on delete set null,
  generation_id uuid references public.generations on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.content_reports enable row level security;
create policy "file report" on public.content_reports for insert with check (auth.uid() = reporter_id);

-- Realtime: the UI subscribes to its own generations rows (RLS applies).
alter publication supabase_realtime add table public.generations;

-- Private buckets, objects live under "<user_id>/...".
insert into storage.buckets (id, name, public) values
  ('references','references', false),
  ('generations','generations', false)
on conflict (id) do nothing;

create policy "own reference files" on storage.objects for all
  using (bucket_id = 'references' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'references' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own generation files read" on storage.objects for select
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);
