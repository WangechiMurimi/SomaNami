# ADR 0004: Store on the device first, sync to Supabase through an outbox

- **Status:** Accepted
- **Date:** recorded 2026-11-16; built in #144 and #146 (PRs #167, #168, #174)
- **Issues:** #143 (epic), #144, #146

## Context

Materials and chats were kept only in the browser. Learners need them on every device, and the app must stay quick and usable when the network is slow or briefly gone.

## Decision

1. **The device is the primary store.** Each account gets its own IndexedDB database, `somanami-user-{userId}`, opened only below `UserStoreGate`. The pre-accounts shared database (`somanami`) is only read to offer an import.
2. **Every synced write queues its own outbox entry in the same transaction.** Writes and deletes go through `commit`, or `guardedCommit` when a precondition must hold. The `upsert` and `tombstone` helpers pair each change with its outbox entry, so a change can't be saved without being queued. Fields that don't sync (`pinned`, `saved`) are written directly.
3. **The sync engine pushes the outbox, then pulls.**
   - It pushes parents before children.
   - It pulls each table by `server_updated_at`, with a 10 s overlap so that rows committed late aren't missed.
   - Chunks and conversation materials travel with their parent rows.
4. **The server enforces the conflict rules**, because an old device can come back at any time with stale changes:
   - **The newer edit wins.** An update with an older client `updated_at` than the stored row is skipped.
   - **Deleted stays deleted.** Deletes are recorded in `deletions` (ids only), and an insert of a deleted id is skipped.
5. **Pulled records never overwrite pending local edits.** `applyPulled` uses `guardedCommit`, so a pulled record is skipped when the local copy changed after its outbox entry was read.

## Consequences

- Reads and writes are local and fast. Sync runs in the background and can be flushed on demand, for example before sign-out.
- Every new mutation of a synced field must go through `upsert` or `tombstone`. #214 was a move that skipped this and never synced.
- Last-write-wins works per record, not per field. Two devices editing the same record at once keep only the newer edit.
- Signing out clears this device's database. Unsynced changes are saved first, or the learner is warned.
- Tests run against an in-memory adapter and an in-memory cloud (`sync/testing/memory-cloud.ts`) that applies the same server rules.

## Alternatives considered

- **Supabase as the only store, read on every view.** Simpler, but every screen would wait on the network, and a dropped connection would lose writes in progress.
- **Supabase Realtime or a CRDT library.** More than this project needs. Records are owned by one learner, so per-record last-write-wins is enough.
