-- Private buckets. Every object path starts with the owner's user id: <uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('character-media', 'character-media', false, 15728640, array['image/jpeg','image/png','image/webp']),
  ('generations', 'generations', false, null, null)
on conflict (id) do nothing;

-- character-media: owners read/write/delete their own folder (uploads go through signed upload URLs).
create policy "own media read" on storage.objects for select to authenticated
  using (bucket_id = 'character-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'character-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'character-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- generations: owners can read their outputs; only the server (service role) writes.
create policy "own generations read" on storage.objects for select to authenticated
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);
