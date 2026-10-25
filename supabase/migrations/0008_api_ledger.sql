-- The ledger: one row for every AI call a person makes (reading images, writing text, generating images), with the
-- platform it went to, the model, the tokens, and what it cost. It replaces usage_ledger and the estimate functions
-- from 0007. Rows are written by the server only; people can read their own.

create table public.api_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- the API platform: 'anthropic', 'openai', 'openrouter', 'google', 'spicyapi', or the host of an "other provider"
  platform text not null,
  job text not null check (job in ('vision', 'llm', 'image')),
  -- what the call was for: 'profile', 'prompt', 'likeness', 'variants', 'carousel', 'test', or 'image:<kind>'
  feature text not null,
  model text,
  -- byok: the person's own key paid. server: the platform paid (the free image); not counted in their spend.
  key_source text not null check (key_source in ('byok', 'server')),
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  -- false when the call could not be priced (cost_usd is then 0 and means "unknown")
  cost_known boolean not null default true,
  -- where the number came from: the provider reported it, or tokens x the provider's list price, or tokens x the person's own price
  cost_source text check (cost_source in ('provider', 'list_price', 'your_price')),
  generation_id uuid references public.generations on delete set null,
  check (cost_known or cost_source is null)
);
alter table public.api_ledger enable row level security;
create policy "own ledger read" on public.api_ledger for select using (auth.uid() = user_id);
create index on public.api_ledger (user_id, id desc);
create index on public.api_ledger (user_id, platform, created_at desc);
create index on public.api_ledger (generation_id) where generation_id is not null;

-- Keep what was recorded before. Old text rows had no source for their price, so they stay blank rather than guessed.
insert into public.api_ledger
  (user_id, created_at, platform, job, feature, model, key_source, status, input_tokens, output_tokens, cost_usd, cost_known, cost_source, generation_id)
select
  user_id, created_at, provider, job, coalesce(feature, case when job = 'image' then 'image' else 'other' end), model, key_source, 'succeeded',
  input_tokens, output_tokens, cost_usd, cost_known,
  case when cost_known and generation_id is not null then 'provider' end,
  generation_id
from public.usage_ledger
where job is not null
order by id;

drop function public.spend_summary(timestamptz, timestamptz);
drop function public.typical_costs();
drop table public.usage_ledger;

-- What the signed-in user spent with their own keys, by platform. Calls the platform paid for are not theirs.
create function public.ledger_summary(p_day_start timestamptz, p_month_start timestamptz, p_job text default null)
returns table (
  platform text,
  day_cost numeric,
  month_cost numeric,
  all_cost numeric,
  calls bigint,
  month_calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  unpriced_calls bigint
)
language sql stable security invoker set search_path = public as $$
  select
    l.platform,
    coalesce(sum(l.cost_usd) filter (where l.created_at >= p_day_start), 0),
    coalesce(sum(l.cost_usd) filter (where l.created_at >= p_month_start), 0),
    coalesce(sum(l.cost_usd), 0),
    count(*),
    count(*) filter (where l.created_at >= p_month_start),
    coalesce(sum(l.input_tokens), 0)::bigint,
    coalesce(sum(l.output_tokens), 0)::bigint,
    count(*) filter (where not l.cost_known)
  from public.api_ledger l
  where l.user_id = auth.uid() and l.key_source = 'byok' and (p_job is null or l.job = p_job)
  group by l.platform
  order by 4 desc, 1
$$;
