# ADR 0005: Learner data stays in our Supabase project, per user

- **Status:** Accepted
- **Date:** recorded 2026-11-16; built in #144, #145, #147 and #148
- **Issues:** #143 (privacy model, epic)

## Context

Learners upload their own documents. The product promises that answers use only their sources, and that their data isn't handed to other services. Documents now leave the device (ADR 0004), so where they go must be fixed.

## Decision

1. **Learners' documents go to two places only:**
   - our Supabase project;
   - the chat model, through our server (ADR 0003).

   No other service may receive them, from the client or the server.
2. **Row Level Security everywhere.** Every table holding learner data has owner-only policies (`user_id = auth.uid()`), tested with pgTAP in `supabase/tests/`.
3. **Originals go in the private `materials` bucket** at `{userId}/{documentId}/{file name}`. Storage policies limit each user to their own folder.
4. **The server acts as the learner, never as admin.**
   - The API verifies the learner's access token against the project's keys (`jose`).
   - It loads chat materials with the publishable key plus that token, so RLS still applies.
   - A secret key in `SUPABASE_PUBLISHABLE_KEY` is refused at startup.
5. **Deleting removes everything.**
   - Deleting a material removes its row, chunks and original, and records the id in `deletions` so no device can restore it.
   - "Erase my materials" does the same for everything the learner stored.
6. **No learner content in logs.** The server logs what failed, never request bodies or passages. Two handlers still log whole error objects: `server/chat/handle-chat.ts` ("Chat answer failed") and `server/app.ts` (unhandled errors). They should be narrowed the way the materials and link handlers already are.

## Consequences

- An RLS mistake would expose data across users, so new tables need owner policies and a pgTAP test before they ship.
- The server can't read a learner's data without that learner's live session. That rules out background jobs over learner content unless this ADR is revised.
- Erasure is real but not instant on other devices: they drop the data on their next pull.

## Alternatives considered

- **A service-role key on the server.** Simpler queries, but one bug could leak every learner's data. Rejected.
- **Keep everything on the device.** Rejected, because learners need their materials on more than one device.
