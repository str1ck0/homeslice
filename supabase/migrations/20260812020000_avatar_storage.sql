-- ---------------------------------------------------------------------------
-- Avatar storage: public to read, yours alone to write.
--
-- The bucket already existed with six overlapping policies, three of them
-- inherited from the pre-rebuild app. Every write policy was scoped to nothing
-- but `bucket_id = 'avatars'`, including the two named "own" — so any signed-in
-- user could overwrite or delete anybody else's avatar. Nothing in the app did
-- that, but the door was open.
--
-- Replaced with one read policy and one write policy per verb, each keyed on
-- the first path segment being your auth id. `uploadAvatar` writes to
-- `<auth uid>/<uuid>.jpg`, which is what makes that check meaningful.
--
-- The bucket stays public: avatars appear dozens to a page in lists, and
-- routing each through a signed-URL redirect the way receipts do would cost a
-- request per face. Paths are unguessable UUIDs, and a face is not a receipt.
-- ---------------------------------------------------------------------------

drop policy if exists "Avatars are publicly accessible" on storage.objects;
drop policy if exists "Users can delete own avatars"    on storage.objects;
drop policy if exists "Users can update own avatars"    on storage.objects;
drop policy if exists "Users can upload avatars"        on storage.objects;
drop policy if exists avatars_authenticated_write       on storage.objects;
drop policy if exists avatars_public_read               on storage.objects;

create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Belt and braces on top of client-side compression: a 5 MB ceiling and images
-- only, enforced where it cannot be bypassed by calling storage directly.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'avatars';
