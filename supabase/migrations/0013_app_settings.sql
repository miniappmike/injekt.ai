-- Settings the admin changes on the site (/admin): daily caps per plan, and the model and price the platform's AI key
-- uses. One row. Only the server reads or writes it.
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (id) values (1) on conflict do nothing;
