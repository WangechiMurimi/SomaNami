-- Embeddings are written to chunks.embedding by the server acting as the
-- learner, through RLS (#153). No migration was needed for this; these tests
-- pin the behaviour the embed route relies on. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

insert into public.workspaces (user_id, id, name, topic, description)
values ('00000000-0000-0000-0000-00000000000a', 'default', 'Biology', '', '');

insert into public.documents (user_id, id, workspace_id, name, size, kind)
values ('00000000-0000-0000-0000-00000000000a', 'doc-1', 'default', 'cells.pdf', 10, 'pdf');

insert into public.chunks (user_id, id, document_id, position, text, source)
values
  ('00000000-0000-0000-0000-00000000000a', 'doc-1:0', 'doc-1', 0, 'Cells divide.', '{"type":"page","page":1}'),
  ('00000000-0000-0000-0000-00000000000a', 'doc-1:1', 'doc-1', 1, 'Mitosis.', '{"type":"page","page":1}');

-- The learner writes a vector to their own chunk ------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$update public.chunks
    set embedding = array_fill(0.25::real, array[768])
    where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'doc-1:0'$$,
  'a learner can store an embedding on their own chunk'
);

select is(
  (select count(*)::int from public.chunks where embedding is not null),
  1,
  'only the chunk that was written has an embedding'
);

select is(
  (select count(*)::int from public.chunks where embedding is null),
  1,
  'the learner can find the chunks still waiting for one'
);

select throws_ok(
  $$update public.chunks set embedding = '[0.1,0.2]'
    where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'doc-1:1'$$,
  '22000',
  null,
  'a vector of the wrong size is rejected'
);

-- A device re-pushing its chunks leaves the vector alone ------------------------
-- Sync inserts chunks with ignoreDuplicates (on conflict do nothing).
select lives_ok(
  $$insert into public.chunks (user_id, id, document_id, position, text, source)
    values ('00000000-0000-0000-0000-00000000000a', 'doc-1:0', 'doc-1', 0, 'Cells divide.', '{"type":"page","page":1}')
    on conflict (user_id, id) do nothing$$,
  'a repeated chunk push succeeds'
);

select ok(
  (select embedding is not null from public.chunks where id = 'doc-1:0'),
  'a repeated chunk push keeps the stored embedding'
);

-- Another learner cannot write to it --------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (with changed as (
     update public.chunks set embedding = null
     where id = 'doc-1:0'
     returning 1
   ) select count(*)::int from changed),
  0,
  'another learner cannot change someone else''s embedding'
);

select * from finish();
rollback;
