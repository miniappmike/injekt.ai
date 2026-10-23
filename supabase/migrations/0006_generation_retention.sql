-- Generated images are kept for 72 hours (see src/lib/retention.ts). The app sets expires_at when a
-- generation completes; a daily job deletes the files; access stops at expires_at either way.

alter table public.generations add column expires_at timestamptz;
update public.generations set expires_at = coalesce(completed_at, created_at) + interval '72 hours' where expires_at is null;
create index on public.generations (expires_at) where output_path is not null;

-- Replace the two earlier read policies with one that also checks expiry.
drop policy if exists "own generation files read" on storage.objects;
drop policy if exists "own generations read" on storage.objects;
create policy "own unexpired generation files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.generations g
      where g.user_id = auth.uid() and g.output_path = name and g.expires_at > now()
    )
  );
