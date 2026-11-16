-- RLS, cascade and timestamp tests for the storage schema (#144).
-- Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- Two accounts, created as the superuser before switching roles.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

create temporary table storage_tables (name text primary key);
insert into storage_tables values
  ('workspaces'), ('documents'), ('chunks'),
  ('conversations'), ('conversation_materials'), ('messages');
grant select on storage_tables to authenticated, anon;

select is(
  (select count(*)::int from pg_class c join storage_tables t on c.relname = t.name
   where c.relnamespace = 'public'::regnamespace and c.relrowsecurity),
  6,
  'RLS is enabled on every storage table'
);

-- User A writes one of everything ---------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into public.workspaces
      (user_id, id, name, topic, description, created_at, updated_at, server_updated_at)
    values
      ('00000000-0000-0000-0000-00000000000a', 'default', 'Biology', 'Cells', '', 10, 20, 1),
      ('00000000-0000-0000-0000-00000000000a', 'a-only', 'Chemistry', '', '', 10, 10, 1)$$,
  'a user can create workspaces'
);

select lives_ok(
  $$insert into public.documents
      (user_id, id, workspace_id, name, size, kind, page_count, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-00000000000a', 'doc-1', 'default', 'cells.pdf', 100, 'pdf', 2, 10, 10),
      ('00000000-0000-0000-0000-00000000000a', 'doc-2', 'default', 'notes.txt', 50, 'text', null, 10, 10)$$,
  'a user can create documents in their workspace'
);

select lives_ok(
  $$insert into public.chunks (user_id, id, document_id, position, text, source)
    values
      ('00000000-0000-0000-0000-00000000000a', 'doc-1:0', 'doc-1', 0, 'Cells divide.', '{"type":"page","page":1}'),
      ('00000000-0000-0000-0000-00000000000a', 'doc-2:0', 'doc-2', 0, 'Mitosis.', '{"type":"paragraph","paragraph":1}')$$,
  'a user can create chunks'
);

select lives_ok(
  $$insert into public.conversations (user_id, id, workspace_id, title, created_at, updated_at)
    values ('00000000-0000-0000-0000-00000000000a', 'conv-1', 'default', 'Cell division', 10, 10)$$,
  'a user can create a conversation'
);

select lives_ok(
  $$insert into public.conversation_materials (user_id, conversation_id, document_id)
    values
      ('00000000-0000-0000-0000-00000000000a', 'conv-1', 'doc-1'),
      ('00000000-0000-0000-0000-00000000000a', 'conv-1', 'doc-2')$$,
  'a user can attach materials to a conversation'
);

select lives_ok(
  $$insert into public.messages (user_id, id, conversation_id, role, content, created_at)
    values ('00000000-0000-0000-0000-00000000000a', 'msg-1', 'conv-1', 'user', 'How do cells divide?', 10)$$,
  'a user can add a message'
);

-- Timestamps.
select isnt(
  (select server_updated_at from public.workspaces where id = 'default'),
  1::bigint,
  'server_updated_at ignores the value a client sends on insert'
);

select results_eq(
  $$select created_at, updated_at from public.workspaces where id = 'default'$$,
  $$values (10::bigint, 20::bigint)$$,
  'created_at and updated_at keep the client''s values'
);

select results_eq(
  $$with changed as (
      update public.workspaces set name = 'Biology 101', updated_at = 30, server_updated_at = 1
      where id = 'default'
      returning updated_at, server_updated_at
    ) select count(*)::int from changed where updated_at = 30 and server_updated_at > 1$$,
  array[1],
  'an update keeps the client updated_at and restamps server_updated_at'
);

select is(
  (select messages.citations from public.messages where id = 'msg-1'),
  '[]'::jsonb,
  'citations default to an empty list'
);

-- Integrity.
select throws_ok(
  $$insert into public.documents (user_id, id, workspace_id, name, size, kind)
    values ('00000000-0000-0000-0000-00000000000a', 'doc-x', 'default', 'x.ppt', 1, 'pptx')$$,
  '23514',
  null,
  'an unknown document kind is rejected'
);

select throws_ok(
  $$insert into public.documents (user_id, id, workspace_id, name, size, kind)
    values ('00000000-0000-0000-0000-00000000000a', 'doc-x', 'missing', 'x.pdf', 1, 'pdf')$$,
  '23503',
  null,
  'a document must belong to an existing workspace'
);

select throws_ok(
  $$insert into public.messages (user_id, id, conversation_id, role, content)
    values ('00000000-0000-0000-0000-00000000000a', 'msg-x', 'conv-1', 'system', 'hi')$$,
  '23514',
  null,
  'an unknown message role is rejected'
);

select throws_ok(
  $$insert into public.workspaces (user_id, id, name, topic, description)
    values ('00000000-0000-0000-0000-00000000000b', 'planted', 'Planted', '', '')$$,
  '42501',
  null,
  'a user cannot create rows for someone else'
);

-- User B, who also has a workspace called 'default' ---------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into public.workspaces (user_id, id, name, topic, description)
    values ('00000000-0000-0000-0000-00000000000b', 'default', 'History', '', '')$$,
  'another user can reuse the same workspace id'
);

select is_empty(
  format('select 1 from public.%I where user_id = %L', name, '00000000-0000-0000-0000-00000000000a'),
  format('another user cannot read %s', name)
)
from storage_tables order by name;

select results_eq(
  format(
    'with changed as (update public.%I set user_id = user_id where user_id = %L returning 1)
     select count(*)::int from changed',
    name, '00000000-0000-0000-0000-00000000000a'
  ),
  array[0],
  format('another user cannot update %s', name)
)
from storage_tables order by name;

select results_eq(
  format(
    'with removed as (delete from public.%I where user_id = %L returning 1)
     select count(*)::int from removed',
    name, '00000000-0000-0000-0000-00000000000a'
  ),
  array[0],
  format('another user cannot delete %s', name)
)
from storage_tables order by name;

select throws_ok(
  $$insert into public.workspaces (user_id, id, name, topic, description)
    values ('00000000-0000-0000-0000-00000000000a', 'planted', 'Planted', '', '')$$,
  '42501', null, 'another user cannot insert workspaces into the account'
);
select throws_ok(
  $$insert into public.documents (user_id, id, workspace_id, name, size, kind)
    values ('00000000-0000-0000-0000-00000000000a', 'planted', 'default', 'p.pdf', 1, 'pdf')$$,
  '42501', null, 'another user cannot insert documents into the account'
);
select throws_ok(
  $$insert into public.chunks (user_id, id, document_id, position, text, source)
    values ('00000000-0000-0000-0000-00000000000a', 'doc-1:9', 'doc-1', 9, 'x', '{}')$$,
  '42501', null, 'another user cannot insert chunks into the account'
);
select throws_ok(
  $$insert into public.conversations (user_id, id, workspace_id, title)
    values ('00000000-0000-0000-0000-00000000000a', 'planted', 'default', 'p')$$,
  '42501', null, 'another user cannot insert conversations into the account'
);
select throws_ok(
  $$insert into public.conversation_materials (user_id, conversation_id, document_id)
    values ('00000000-0000-0000-0000-00000000000a', 'conv-1', 'doc-1')$$,
  '42501', null, 'another user cannot insert conversation materials into the account'
);
select throws_ok(
  $$insert into public.messages (user_id, id, conversation_id, role, content)
    values ('00000000-0000-0000-0000-00000000000a', 'planted', 'conv-1', 'user', 'p')$$,
  '42501', null, 'another user cannot insert messages into the account'
);

select throws_ok(
  $$insert into public.workspaces (user_id, id, name, topic, description)
    values ('00000000-0000-0000-0000-00000000000a', 'default', 'Taken', '', '')
    on conflict (user_id, id) do update set name = excluded.name$$,
  '42501',
  null,
  'another user cannot overwrite a workspace through an upsert'
);

-- B's own document ids resolve against B's workspaces, never A's.
select throws_ok(
  $$insert into public.documents (user_id, id, workspace_id, name, size, kind)
    values ('00000000-0000-0000-0000-00000000000b', 'doc-b', 'a-only', 'b.pdf', 1, 'pdf')$$,
  '23503',
  null,
  'a document cannot point at a workspace from another account'
);

-- Signed-out visitors ---------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  format('select * from public.%I', name),
  '42501',
  null,
  format('a signed-out visitor cannot read %s', name)
)
from storage_tables order by name;

-- Back to the superuser to check what the policies hid ------------------------
reset role;

select is(
  (select name from public.workspaces
   where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'default'),
  'Biology 101',
  'the other user''s attempts left the workspace unchanged'
);

-- Cascades, as user A ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

delete from public.documents where id = 'doc-1';

select is_empty(
  $$select 1 from public.chunks where document_id = 'doc-1'$$,
  'deleting a document deletes its chunks'
);

select results_eq(
  $$select document_id from public.conversation_materials where conversation_id = 'conv-1'$$,
  array['doc-2'],
  'deleting a document removes it from conversations that used it'
);

select is(
  (select count(*)::int from public.conversations where id = 'conv-1'),
  1,
  'deleting a document keeps the conversations'
);

delete from public.workspaces where id = 'default';

select is(
  (select count(*)::int from public.documents) + (select count(*)::int from public.chunks)
    + (select count(*)::int from public.conversations)
    + (select count(*)::int from public.conversation_materials)
    + (select count(*)::int from public.messages),
  0,
  'deleting a workspace deletes its documents, chunks, conversations and messages'
);

reset role;

select is(
  (select count(*)::int from public.workspaces where user_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'deleting a workspace leaves another user''s workspace with the same id'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';

select is_empty(
  $$select 1 from public.workspaces where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  'deleting the account deletes its workspaces'
);

select * from finish();
rollback;
