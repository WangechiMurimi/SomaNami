# SomaNami

An AI-powered learning app: upload a document, ask questions about it, and get
answers grounded in the document with references to the passages they came
from. See [`docs/PRD.md`](docs/PRD.md) for the product requirements.

## How it fits together

- **Browser:** parses uploads (PDF, DOCX, TXT, Markdown) into source-referenced
  chunks, stores them locally in IndexedDB, and retrieves relevant passages
  with BM25, all without a network connection.
- **API:** `POST /api/chat` receives the question, the ids of the learner's
  materials and the conversation so far. It loads those materials from
  Supabase as the learner, ranks their passages, and asks our self-hosted
  Ollama model to answer **only** from the best ones (Claude can stand in
  during local development, never in production). Grounding is enforced in
  code: if no passage scores high enough the model is not called, and an
  answer whose citations don't match the passages sent is reported as not
  covered. Model credentials exist only on the server.
- **Deployment:** Netlify serves the static build and runs the API as Netlify
  Functions (`netlify/functions/`). Locally, the same handlers run in Express.

Shared data shapes are defined in [`src/types/contracts.ts`](src/types/contracts.ts).

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm install
cp .env.example .env    # then set OLLAMA_BASE_URL (or LLM_PROVIDER=claude)
npm run server:dev      # API on http://localhost:3001
npm run dev             # app on http://localhost:5173 (proxies /api to the API)
```

Without a configured model the app still uploads, stores and searches
documents; the chat route answers `503 not-configured`.

### Local database

Schema changes live in `supabase/migrations/` and their row-level security
tests in `supabase/tests/`. Running them needs
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) and
the Supabase CLI (`brew install supabase/tap/supabase`).

```bash
npm run db:start    # local Supabase; prints the API URL and keys for .env
npm run db:test     # pgTAP tests for migrations and RLS
npm run db:reset    # rebuild the database from the migrations
npm run db:stop
```

Learners' materials and chats live in `workspaces`, `documents`, `chunks`,
`conversations`, `conversation_materials` and `messages`: each row belongs to
one account (`user_id`), and deleting a parent deletes everything under it.

Devices sync with these tables (`src/lib/sync/`): each device keeps working
offline and pushes its outbox and pulls other devices' changes when online.
The newer edit wins, and a deleted record never comes back (`deletions` holds
their ids). The sync engine's test against the real local stack is skipped
unless you pass the stack's URL and keys:

```bash
eval "$(supabase status -o env | sed 's/^/export SYNC_IT_/')"
npx vitest run src/lib/sync/supabase-cloud.integration.test.ts
```

Add a migration with `supabase migration new <name>`. The hosted database is
not updated by CI: after a migration is merged, apply it with
`supabase db push` (once, after `supabase link`).

Google sign-in locally needs a Google OAuth web client whose authorised
redirect URI is `http://127.0.0.1:54321/auth/v1/callback`. Put its id and
secret in `supabase/.env` (gitignored) as
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, then restart with `npm run db:start`.
Email and password sign-in works without them.

## Scripts

| Script                 | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Vite dev server                                       |
| `npm run server:dev`   | Express API with reload, loading `.env` if present    |
| `npm test`             | Vitest (unit and component tests)                     |
| `npm run typecheck`    | `tsc -b` across app, tests and server                 |
| `npm run lint`         | ESLint                                                |
| `npm run format:check` | Prettier check (`npm run format` to fix)              |
| `npm run build`        | Production build to `dist/`                           |
| `npm run db:start`     | Local Supabase in Docker (`db:stop` to stop it)       |
| `npm run db:test`      | pgTAP tests against the local database                |
| `npm run db:reset`     | Rebuild the local database from the migrations        |

CI runs lint, typecheck, format check, tests and build on every pull request,
and applies the migrations to a fresh database to run the pgTAP tests.

## Deploying to Netlify

Connect the repository in Netlify; `netlify.toml` sets the build command,
publish directory and functions directory. Set `OLLAMA_BASE_URL` (the Ollama
gateway's HTTPS address) and `OLLAMA_API_KEY` (its bearer key) in the site's
environment variables, optionally `OLLAMA_MODEL` and `OLLAMA_TIMEOUT_MS`; the
comments in `netlify.toml` explain each. Claude is refused when
`CONTEXT=production`, so don't set `LLM_PROVIDER=claude` there.

| `LLM_PROVIDER`      | Model                                 | Where                       |
| ------------------- | ------------------------------------- | --------------------------- |
| `ollama` (default)  | `OLLAMA_MODEL`, default `qwen2.5:3b`  | Everywhere                  |
| `claude`            | `CLAUDE_MODEL`, default Opus 5.5      | Local development only      |

Chat errors from the model call: `503 rate-limited`, `503 not-configured`,
`502 upstream-unreachable`, `502 upstream-failed` and `504 upstream-timeout`
(the model missed its deadline).

## Contributing

Work follows Scrum on GitHub Issues with feature branches and pull requests;
see [`AGENTS.md`](AGENTS.md) for conventions.
