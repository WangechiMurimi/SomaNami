-- Original files of learners' materials (#145), kept so a material can be
-- re-parsed or downloaded later. Objects live at
-- `{user id}/{document id}/{file name}`, and documents.storage_path records
-- that path.

-- Private: every read goes through the policies below, never a public URL.
-- The size limit matches MAX_FILE_BYTES in src/features/upload/constants.ts,
-- so the server refuses what the browser would never have accepted.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 20971520);

-- A learner reaches only objects in their own top-level folder. Upserts need
-- select, insert and update together, so all four operations are granted.
-- `(select auth.uid())` is evaluated once per statement instead of per row.
create policy "materials: owner can read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "materials: owner can upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- with check stops an object being renamed into another learner's folder.
create policy "materials: owner can replace"
on storage.objects for update
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "materials: owner can delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
