-- Profiles (#142): the details a learner gives after creating an account.
-- They live here rather than in auth user metadata because users can edit
-- their own metadata through the Auth API, bypassing any checks we make.
-- No birth date is ever stored; only the yes/no answer to "13 or older".

-- Epoch milliseconds, matching the timestamps in src/types/contracts.ts.
create function public.epoch_ms()
returns bigint
language sql
stable
set search_path = ''
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    check (display_name is null or char_length(btrim(display_name)) between 1 and 100),
  age_13_plus boolean not null default false,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms()
);

comment on table public.profiles is
  'One row per account; written by its owner from the sign-up details step.';

-- The server owns the timestamps, so a client clock can't reorder edits or
-- rewrite when the profile was created.
create function public.profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := public.epoch_ms();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := public.epoch_ms();
  return new;
end
$$;

create trigger profiles_touch
before insert or update on public.profiles
for each row execute function public.profiles_touch();

alter table public.profiles enable row level security;

-- Signed-out visitors get nothing; signed-in users only their own row.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;

-- `(select auth.uid())` is evaluated once per statement instead of per row.
create policy "profiles: owner can read"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles: owner can create"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "profiles: owner can update"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- No delete policy: a profile goes away only with its account (on delete cascade).
