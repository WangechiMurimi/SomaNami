# ADR 0002: Run the API as Netlify Functions over shared handlers

- **Status:** Accepted
- **Date:** 2026-11-09
- **Issues:** the chat API (#148) and link fetching (#93) follow it

## Context

The stack names Netlify for deployment and Node.js + Express for the backend. Netlify doesn't run a long-lived Express server.

## Decision

1. **Production runs Netlify Functions** (`netlify/functions/*.ts`).
2. **Route logic lives in transport-neutral handlers** (`server/chat/handle-chat.ts`, `server/link/handle-fetch-link.ts`). The Functions and the local Express app (`server/app.ts`) are thin adapters over the same handlers, so the two can't drift apart.
3. **Express is for local development and tests.** It runs as `.ts` through Node's type stripping, and Vite proxies `/api` to it.
4. **Secrets stay on the server.** Server code is never imported from `src/`, and the tsconfig split keeps it out of the client bundle.

## Consequences

- Netlify's synchronous Function time limit (about 10 s) applies to `/api/chat`. This drives the hosting question in ADR 0003.
- Long-running work needs Netlify Background Functions or a separate worker.
- Local development runs two processes: `npm run dev` and `npm run server:dev`.
- `netlify/functions/` may hold only deployable Functions; their tests live in `netlify/function-tests/` (#199).

## Later changes

- The caption-fetching service planned for video was dropped when the video work was set aside (#213). It is kept on the `archive/video-track` branch.
