-- Sync rules (#146): deletions table RLS, newer edit wins, deleted stays
-- deleted. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

select is(
  (select relrowsecurity from pg_class
   where relname = 'deletions' and relnamespace = 'public'::regnamespace),
  true,
  'RLS is enabled on deletions'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.workspaces (user_id, id, name, topic, description, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'w1', 'Biology', '', '', 10, 100);

-- Rule 1: the newer edit wins -------------------------------------------------

update public.workspaces set name = 'Stale', updated_at = 50
where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'w1';

select is(
  (select name from public.workspaces where id = 'w1'),
  'Biology',
  'an update with an older updated_at is skipped'
);

update public.workspaces set name = 'Biology 2', updated_at = 200
where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'w1';

select is(
  (select name from public.workspaces where id = 'w1'),
  'Biology 2',
  'an update with a newer updated_at applies'
);

-- Same as a sync push: an upsert from a device that was offline.
insert into public.workspaces (user_id, id, name, topic, description, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'w1', 'Offline edit', '', '', 10, 150)
on conflict (user_id, id) do update
  set name = excluded.name, updated_at = excluded.updated_at;

select is(
  (select name from public.workspaces where id = 'w1'),
  'Biology 2',
  'an older upsert does not overwrite a newer row'
);

-- Rule 2: deleted stays deleted -----------------------------------------------

insert into public.documents (user_id, id, workspace_id, name, size, kind, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'd1', 'w1', 'cells.pdf', 1, 'pdf', 10, 10);

select lives_ok(
  $$insert into public.deletions (user_id, record_type, record_id, deleted_at)
    values ('00000000-0000-0000-0000-00000000000a', 'documents', 'd1', 500)$$,
  'a user can record a deletion'
);

delete from public.documents
where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'd1';

insert into public.documents (user_id, id, workspace_id, name, size, kind, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'd1', 'w1', 'cells.pdf', 1, 'pdf', 10, 20);

select is(
  (select count(*)::int from public.documents where id = 'd1'),
  0,
  'a record created before its deletion cannot be inserted again'
);

insert into public.documents (user_id, id, workspace_id, name, size, kind, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'd1', 'w1', 'new.pdf', 1, 'pdf', 900, 900);

select is(
  (select name from public.documents where id = 'd1'),
  'new.pdf',
  'a record created after the deletion (a reused id) is allowed'
);

select lives_ok(
  $$insert into public.deletions (user_id, record_type, record_id, deleted_at)
    values ('00000000-0000-0000-0000-00000000000a', 'documents', 'd1', 950)
    on conflict (user_id, record_type, record_id)
    do update set deleted_at = excluded.deleted_at$$,
  'a retried deletion upserts'
);

insert into public.deletions (user_id, record_type, record_id, deleted_at, server_updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'messages', 'm1', 1, 7);

select isnt(
  (select server_updated_at from public.deletions where record_id = 'm1'),
  7::bigint,
  'the server sets server_updated_at on deletions'
);

select throws_ok(
  $$insert into public.deletions (user_id, record_type, record_id, deleted_at)
    values ('00000000-0000-0000-0000-00000000000a', 'chunks', 'c1', 1)$$,
  '23514',
  null,
  'only synced record types can be recorded'
);

select throws_ok(
  $$insert into public.deletions (user_id, record_type, record_id, deleted_at)
    values ('00000000-0000-0000-0000-00000000000b', 'documents', 'x', 1)$$,
  '42501',
  null,
  'a user cannot record a deletion for someone else'
);

select throws_ok(
  $$delete from public.deletions where record_id = 'm1'$$,
  '42501',
  null,
  'deletions cannot be removed by a user'
);

-- Another user ----------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*)::int from public.deletions),
  0,
  'a user cannot read another user''s deletions'
);

update public.deletions set deleted_at = 1
where user_id = '00000000-0000-0000-0000-00000000000a';

-- B's own documents are unaffected by A's deletion of the same id.
insert into public.workspaces (user_id, id, name, topic, description, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000b', 'w1', 'B', '', '', 1, 1);
insert into public.documents (user_id, id, workspace_id, name, size, kind, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000000b', 'd1', 'w1', 'b.pdf', 1, 'pdf', 1, 1);

select is(
  (select count(*)::int from public.documents where id = 'd1'),
  1,
  'one user''s deletion does not block another user''s record'
);

reset role;

select is(
  (select deleted_at from public.deletions
   where user_id = '00000000-0000-0000-0000-00000000000a' and record_id = 'd1'),
  950::bigint,
  'a user cannot change another user''s deletions'
);

-- Anonymous -------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$select count(*) from public.deletions$$,
  '42501',
  null,
  'anon cannot read deletions'
);

select * from finish();
rollback;
