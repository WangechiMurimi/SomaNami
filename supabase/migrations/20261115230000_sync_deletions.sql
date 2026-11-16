-- Sync between devices and the cloud (#146).
--
-- Devices push their changes and pull everyone else's by server_updated_at
-- (see 20261115221744_storage_schema.sql). Two rules are enforced here rather
-- than trusted to every device, because an old or offline device can come
-- back at any time with stale changes:
--
-- 1. The newer edit wins. An update carrying an older client updated_at than
--    the stored row is skipped, so a device that was offline can't overwrite
--    a later edit made elsewhere.
-- 2. Deleted stays deleted. A delete is recorded in `deletions` (ids only,
--    never content), and an insert of a recorded id is skipped, so an erased
--    material never comes back from a device that hadn't heard about it yet.
--    Only records created before the delete are skipped: almost every id is
--    a random UUID, but the 'default' workspace id is reused when a device
--    recreates it, and that later record is genuinely new.

-- Deletions ------------------------------------------------------------------

create table public.deletions (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type text not null
    check (record_type in ('workspaces', 'documents', 'conversations', 'messages')),
  record_id text not null,
  -- Client time of the delete; the server's own time is the pull cursor.
  deleted_at bigint not null,
  server_updated_at bigint not null default public.epoch_ms(),
  primary key (user_id, record_type, record_id)
);

comment on table public.deletions is
  'Ids of deleted records, so other devices remove them too. Holds no content.';

create index deletions_cursor_idx
  on public.deletions (user_id, server_updated_at, record_id);

create trigger deletions_server_updated_at
before insert or update on public.deletions
for each row execute function public.set_server_updated_at();

alter table public.deletions enable row level security;
revoke all on public.deletions from anon;
revoke all on public.deletions from authenticated;
-- No delete: a tombstone outlives its record. It goes away with the account.
grant select, insert, update on public.deletions to authenticated;

create policy "deletions: owner can read" on public.deletions for select
to authenticated using (user_id = (select auth.uid()));

create policy "deletions: owner can create" on public.deletions for insert
to authenticated with check (user_id = (select auth.uid()));

-- Needed for the upsert a retried push sends; with check keeps rows owned.
create policy "deletions: owner can update" on public.deletions for update
to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Rule 1: the newer edit wins ---------------------------------------------

create function public.keep_newer_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Returning null skips this row's update; the statement carries on.
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end
$$;

-- Messages are append-only and have no updated_at, so they don't need it.
create trigger workspaces_keep_newer
before update on public.workspaces
for each row execute function public.keep_newer_edit();

create trigger documents_keep_newer
before update on public.documents
for each row execute function public.keep_newer_edit();

create trigger conversations_keep_newer
before update on public.conversations
for each row execute function public.keep_newer_edit();

-- Rule 2: deleted stays deleted ---------------------------------------------

-- Security invoker (the default), so the lookup is filtered by RLS too; the
-- row's user_id is checked against auth.uid() by the insert policy anyway.
create function public.skip_deleted_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.deletions d
    where d.user_id = new.user_id
      and d.record_type = tg_table_name
      and d.record_id = new.id
      and d.deleted_at >= new.created_at
  ) then
    return null;
  end if;
  return new;
end
$$;

create trigger workspaces_skip_deleted
before insert on public.workspaces
for each row execute function public.skip_deleted_insert();

create trigger documents_skip_deleted
before insert on public.documents
for each row execute function public.skip_deleted_insert();

create trigger conversations_skip_deleted
before insert on public.conversations
for each row execute function public.skip_deleted_insert();

create trigger messages_skip_deleted
before insert on public.messages
for each row execute function public.skip_deleted_insert();
