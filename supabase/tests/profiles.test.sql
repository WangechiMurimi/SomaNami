-- RLS and integrity tests for public.profiles (#142). Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Two accounts, created as the superuser before switching roles.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

-- Act as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into public.profiles (id, display_name, age_13_plus, created_at)
    values ('00000000-0000-0000-0000-00000000000a', 'Asha', true, 1)$$,
  'a user can create their own profile'
);

select isnt(
  (select created_at from public.profiles),
  1::bigint,
  'the server sets created_at, ignoring the client value'
);

select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('00000000-0000-0000-0000-00000000000b', 'Not B')$$,
  '42501',
  null,
  'a user cannot create a profile for someone else'
);

select throws_ok(
  $$update public.profiles set display_name = '   '
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'a blank display name is rejected'
);

select results_eq(
  $$with changed as (
      update public.profiles set display_name = 'Asha W.', created_at = 2
      where id = '00000000-0000-0000-0000-00000000000a'
      returning created_at
    ) select count(*)::int from changed where created_at <> 2$$,
  array[1],
  'a user can update their own profile but not its created_at'
);

select throws_ok(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  'a user cannot delete a profile directly'
);

-- Act as user B.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty(
  $$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$,
  'another user cannot read the profile'
);

select results_eq(
  $$with changed as (
      update public.profiles set display_name = 'Taken over'
      where id = '00000000-0000-0000-0000-00000000000a'
      returning 1
    ) select count(*)::int from changed$$,
  array[0],
  'another user cannot update the profile'
);

select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('00000000-0000-0000-0000-00000000000a', 'Overwrite')
    on conflict (id) do update set display_name = excluded.display_name$$,
  '42501',
  null,
  'another user cannot overwrite the profile through an upsert'
);

-- Signed-out visitors.
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'a signed-out visitor cannot read profiles'
);

-- Back to the superuser to check what the policies hid.
reset role;

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Asha W.',
  'the other user''s attempts left the profile unchanged'
);

select ok(
  (select updated_at >= created_at from public.profiles
   where id = '00000000-0000-0000-0000-00000000000a'),
  'updated_at is set by the server'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is_empty(
  $$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$,
  'deleting the account deletes its profile'
);

select * from finish();
rollback;
