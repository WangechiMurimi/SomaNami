# ADR 0008: Keep loose chats and materials in a hidden default workspace

- **Status:** Accepted
- **Date:** 2026-11-15
- **Issues:** #177 (source-scoping revisions)

## Context

Learners can start a chat from Home or the Library without making a workspace. The data model says every material and chat belongs to a workspace, and the storage indexes, sync and RLS all assume it.

## Decision

1. **Loose chats and materials live in the existing `default` workspace.** The UI never shows it as a workspace. `isLooseWorkspace(id)` is the one check for it, and screens filter it out with `userWorkspaces()`.
2. **Loose chats may use any of the learner's materials.** Chats in a user's workspace stay scoped to that workspace's materials (US-08 AC3).
3. **"Remove from workspace" moves a material to the default workspace**, so it stays in My library. Chats in the workspace it left stop using it but keep their history. Deleting is a separate action, in the Library.
4. **The default workspace is created on first use**, so fresh and upgraded installs end up with the same record.

## Consequences

- No schema, index or sync change was needed for loose chats.
- Code must use `isLooseWorkspace` rather than compare ids, and must never list the default workspace as a user workspace.
- The default workspace id is reused across devices, so the sync deletion rule only blocks records created before a delete (ADR 0004).

## Alternatives considered

- **Make `workspaceId` optional.** It would touch every index, sync mapping and RLS policy that assumes a parent workspace.
