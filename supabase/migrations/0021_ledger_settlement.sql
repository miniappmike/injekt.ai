-- Real costs on the ledger. SpicyAPI charges every call as a task, and looking the task up gives its final charge.
-- Each row keeps the task ids it was charged under, and whether its cost is the final charge yet (until then a text
-- call shows tokens x the list price and an image shows the amount held for it). The server settles rows right after
-- the call and again in the daily cleanup.
alter table public.api_ledger add column if not exists provider_task_ids text[];
alter table public.api_ledger add column if not exists cost_settled boolean not null default false;
create index if not exists api_ledger_unsettled on public.api_ledger (created_at)
  where not cost_settled and provider_task_ids is not null;

-- ledger_summary also counts the images generated.
drop function if exists public.ledger_summary(timestamptz, timestamptz, text);
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
  unpriced_calls bigint,
  images bigint,
  month_images bigint
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
    count(*) filter (where not l.cost_known),
    count(*) filter (where l.job = 'image' and l.status = 'succeeded'),
    count(*) filter (where l.job = 'image' and l.status = 'succeeded' and l.created_at >= p_month_start)
  from public.api_ledger l
  where l.user_id = auth.uid() and l.key_source = 'byok' and (p_job is null or l.job = p_job)
  group by l.platform
  order by 4 desc, 1
$$;
