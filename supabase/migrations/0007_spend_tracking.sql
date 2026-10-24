-- Spend tracking: every AI call (reading images, writing text, generating images) is recorded on the ledger
-- with which job it was, the model, and the tokens used, so the app can show what you are spending.

alter table public.usage_ledger
  add column job text check (job in ('vision', 'llm', 'image')),
  add column feature text,
  add column model text,
  add column input_tokens int,
  add column output_tokens int,
  -- false when the app could not price the call (no list price for the model and none entered by the user)
  add column cost_known boolean not null default true;

-- Text calls cost fractions of a cent, so keep more than four decimals.
alter table public.usage_ledger alter column cost_usd type numeric(12, 6);

update public.usage_ledger set job = 'image' where job is null and generation_id is not null;
create index on public.usage_ledger (user_id, job, created_at desc);

-- What the signed-in user spent with their own keys, by job. Platform-paid calls (the free image) are not theirs.
create function public.spend_summary(p_day_start timestamptz, p_month_start timestamptz)
returns table (
  job text,
  day_cost numeric,
  month_cost numeric,
  month_calls bigint,
  month_input_tokens bigint,
  month_output_tokens bigint,
  unpriced_calls bigint
)
language sql stable security invoker set search_path = public as $$
  select
    l.job,
    coalesce(sum(l.cost_usd) filter (where l.created_at >= p_day_start), 0),
    coalesce(sum(l.cost_usd), 0),
    count(*),
    coalesce(sum(l.input_tokens), 0)::bigint,
    coalesce(sum(l.output_tokens), 0)::bigint,
    count(*) filter (where not l.cost_known)
  from public.usage_ledger l
  where l.user_id = auth.uid() and l.key_source = 'byok' and l.job is not null and l.created_at >= p_month_start
  group by l.job
$$;

-- The average cost of each action over the user's latest 10 priced runs, so the app can say what the next one will cost.
create function public.typical_costs()
returns table (feature text, avg_cost numeric, runs int)
language sql stable security invoker set search_path = public as $$
  select t.feature, avg(t.cost_usd), count(*)::int
  from (
    select l.feature, l.cost_usd,
           row_number() over (partition by l.feature order by l.created_at desc) as rn
    from public.usage_ledger l
    where l.user_id = auth.uid() and l.key_source = 'byok' and l.cost_known and l.feature is not null
  ) t
  where t.rn <= 10
  group by t.feature
$$;
