-- Learners' materials and chats in the cloud (#144), mirroring
-- src/types/contracts.ts so device records and rows match one to one.
--
-- Ids are the client-generated text ids. They are only unique per learner
-- (every device has a workspace called 'default'), so each primary key is
-- (user_id, id) and each child points at its parent through
-- (user_id, parent_id). That composite key also means a row can never hang
-- off another learner's parent: RLS pins user_id to the caller.
--
-- Two clocks per row:
-- - created_at / updated_at come from the device. Sync uses updated_at for
--   last-write-wins, so the server must keep whatever the client sent.
-- - server_updated_at is stamped by the server on every write and is the
--   cursor a device pulls from. A client value is always overwritten, so a
--   skewed device clock can't hide a change from other devices.

create extension if not exists vector with schema extensions;

-- Generic, unlike profiles_touch: these tables keep the client's timestamps
-- and only need the server's own write time.
create function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := public.epoch_ms();
  return new;
end
$$;

-- Workspaces -----------------------------------------------------------------

create table public.workspaces (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  topic text not null,
  description text not null,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  server_updated_at bigint not null default public.epoch_ms(),
  primary key (user_id, id)
);

comment on table public.workspaces is
  'A learner''s topics; deleting one deletes its materials and conversations.';

-- Documents ------------------------------------------------------------------

create table public.documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  workspace_id text not null,
  name text not null,
  size bigint not null check (size >= 0),
  kind text not null check (kind in ('pdf', 'docx', 'text', 'web')),
  page_count int check (page_count is null or page_count >= 0),
  source_url text,
  fetched_at bigint,
  -- Path of the original file in the private `materials` bucket (#145).
  storage_path text,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  server_updated_at bigint not null default public.epoch_ms(),
  primary key (user_id, id),
  foreign key (user_id, workspace_id)
    references public.workspaces (user_id, id) on delete cascade
);

create index documents_workspace_idx on public.documents (user_id, workspace_id);

comment on table public.documents is
  'Parsed materials; the text lives in chunks, the original file in storage.';

-- Chunks ---------------------------------------------------------------------

-- Immutable once written (a re-parse is a new document), so no updated_at:
-- devices pull chunks along with their document.
create table public.chunks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  document_id text not null,
  position int not null check (position >= 0),
  text text not null,
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  -- Filled in by the embedding job (Epic B); the size must match its model.
  embedding extensions.vector(768),
  primary key (user_id, id),
  foreign key (user_id, document_id)
    references public.documents (user_id, id) on delete cascade
);

create index chunks_document_idx on public.chunks (user_id, document_id, position);

comment on table public.chunks is
  'Retrievable passages of a document; id is <documentId>:<index>.';

-- Conversations --------------------------------------------------------------

create table public.conversations (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  workspace_id text not null,
  title text not null,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  server_updated_at bigint not null default public.epoch_ms(),
  primary key (user_id, id),
  foreign key (user_id, workspace_id)
    references public.workspaces (user_id, id) on delete cascade
);

create index conversations_workspace_idx on public.conversations (user_id, workspace_id);

-- Conversation.materialIds as rows, so deleting a document drops it from
-- every conversation that used it.
create table public.conversation_materials (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  document_id text not null,
  primary key (user_id, conversation_id, document_id),
  foreign key (user_id, conversation_id)
    references public.conversations (user_id, id) on delete cascade,
  foreign key (user_id, document_id)
    references public.documents (user_id, id) on delete cascade
);

-- The primary key already covers lookups by conversation.
create index conversation_materials_document_idx
  on public.conversation_materials (user_id, document_id);

-- Messages are append-only, so created_at is their only client timestamp.
create table public.messages (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  conversation_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  answerable boolean,
  created_at bigint not null default public.epoch_ms(),
  server_updated_at bigint not null default public.epoch_ms(),
  primary key (user_id, id),
  foreign key (user_id, conversation_id)
    references public.conversations (user_id, id) on delete cascade
);

create index messages_conversation_idx
  on public.messages (user_id, conversation_id, created_at);

-- Server write time ----------------------------------------------------------

create trigger workspaces_server_updated_at
before insert or update on public.workspaces
for each row execute function public.set_server_updated_at();

create trigger documents_server_updated_at
before insert or update on public.documents
for each row execute function public.set_server_updated_at();

create trigger conversations_server_updated_at
before insert or update on public.conversations
for each row execute function public.set_server_updated_at();

create trigger messages_server_updated_at
before insert or update on public.messages
for each row execute function public.set_server_updated_at();

-- Row-level security ---------------------------------------------------------
-- Every table: signed-out visitors get nothing, and a signed-in learner reads
-- and writes only rows carrying their own user_id. Every primary key starts
-- with user_id, so these filters use an index without a separate one.
-- `(select auth.uid())` is evaluated once per statement instead of per row.

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces', 'documents', 'chunks',
    'conversations', 'conversation_materials', 'messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t
    );

    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select
       to authenticated using (user_id = (select auth.uid()))', t
    );
    execute format(
      'create policy "%1$s: owner can create" on public.%1$I for insert
       to authenticated with check (user_id = (select auth.uid()))', t
    );
    -- with check stops a learner moving a row to another account.
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update
       to authenticated using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t
    );
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete
       to authenticated using (user_id = (select auth.uid()))', t
    );
  end loop;
end
$$;
