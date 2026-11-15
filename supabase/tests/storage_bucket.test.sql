-- Policy tests for the private `materials` bucket (#145).
-- Run with `npm run db:test`. Rows are written straight to storage.objects,
-- which is what the Storage API does on the caller's behalf, as the caller.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'materials'$$,
  $$values (false, 20971520::bigint)$$,
  'the materials bucket is private and capped at the upload size limit'
);

-- User A --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('materials', '00000000-0000-0000-0000-00000000000a/doc-1/cells.pdf')$$,
  'a user can upload into their own folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('materials', '00000000-0000-0000-0000-00000000000b/doc-1/planted.pdf')$$,
  '42501',
  null,
  'a user cannot upload into another user''s folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('materials', 'doc-1/cells.pdf')$$,
  '42501',
  null,
  'a user cannot upload outside any user folder'
);

select throws_ok(
  $$update storage.objects
    set name = '00000000-0000-0000-0000-00000000000b/doc-1/cells.pdf'
    where name = '00000000-0000-0000-0000-00000000000a/doc-1/cells.pdf'$$,
  '42501',
  null,
  'a user cannot move an object into another user''s folder'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'materials'),
  1,
  'a user can read their own objects'
);

-- User B --------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty(
  $$select 1 from storage.objects
    where name like '00000000-0000-0000-0000-00000000000a/%'$$,
  'another user cannot read the object'
);

select results_eq(
  $$with changed as (
      update storage.objects set metadata = '{"taken":true}'
      where name like '00000000-0000-0000-0000-00000000000a/%'
      returning 1
    ) select count(*)::int from changed$$,
  array[0],
  'another user cannot replace the object'
);

-- The Storage API sets this before deleting; without it every delete fails.
set local storage.allow_delete_query = 'true';

select results_eq(
  $$with removed as (
      delete from storage.objects
      where name like '00000000-0000-0000-0000-00000000000a/%'
      returning 1
    ) select count(*)::int from removed$$,
  array[0],
  'another user cannot delete the object'
);

-- Signed-out visitors -------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is_empty(
  $$select 1 from storage.objects where bucket_id = 'materials'$$,
  'a signed-out visitor cannot read objects'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('materials', '00000000-0000-0000-0000-00000000000a/doc-2/x.pdf')$$,
  '42501',
  null,
  'a signed-out visitor cannot upload'
);

-- Back to the superuser to check what the policies hid ----------------------
reset role;

select results_eq(
  $$select name, metadata from storage.objects where bucket_id = 'materials'$$,
  $$values ('00000000-0000-0000-0000-00000000000a/doc-1/cells.pdf', null::jsonb)$$,
  'the other users'' attempts left the object in place and unchanged'
);

-- User A removes their own object ------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$with removed as (
      delete from storage.objects
      where name = '00000000-0000-0000-0000-00000000000a/doc-1/cells.pdf'
      returning 1
    ) select count(*)::int from removed$$,
  array[1],
  'a user can delete their own object'
);

reset role;

select is_empty(
  $$select 1 from storage.objects where bucket_id = 'materials'$$,
  'the deleted object is gone'
);

select * from finish();
rollback;
