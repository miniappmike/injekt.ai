-- Reference sheets are never deleted by the 72-hour cleanup (see src/lib/retention.ts, KEPT_KINDS).
-- New sheets get an expiry 100 years out when they finish; this moves the sheets that already exist.
-- Only sheets whose file still exists and hasn't expired are changed (expired ones were already deleted).
update public.generations
set expires_at = coalesce(completed_at, created_at) + interval '100 years'
where kind = 'reference_sheet'
  and status = 'complete'
  and output_path is not null
  and expires_at > now();
