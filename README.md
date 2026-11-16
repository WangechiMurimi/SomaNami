# SomaNami

An AI-powered learning app: upload a document, ask questions about it, and get
answers grounded in the document with references to the passages they came
from. See [`docs/PRD.md`](docs/PRD.md) for the product requirements.

## How it fits together

- **Browser:** parses uploads (PDF, DOCX, TXT, Markdown) into source-referenced
  chunks, stores them locally in IndexedDB, and retrieves relevant passages
  with BM25, all without a network connection.
- **API:** `POST /api/chat` receives the question, the retrieved passages and
  the conversation so far, and asks Claude to answer **only** from those
  passages. Citations the model returns are checked against the passages that
  were sent. The Anthropic API key exists only on the server.
- **Deployment:** Netlify serves the static build and runs the API as Netlify
  Functions (`netlify/functions/`). Locally, the same handlers run in Express.

Shared data shapes are defined in [`src/types/contracts.ts`](src/types/contracts.ts).

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm install
cp .env.example .env    # then set ANTHROPIC_API_KEY
npm run server:dev      # API on http://localhost:3001
npm run dev             # app on http://localhost:5173 (proxies /api to the API)
```

Without an API key the app still uploads, stores and searches documents; the
chat route answers `503 not-configured`.

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
| `npm run test:e2e`     | Playwright end-to-end tests (`test:e2e:ui` to debug)  |
| `npm run typecheck`    | `tsc -b` across app, tests and server                 |
| `npm run lint`         | ESLint                                                |
| `npm run format:check` | Prettier check (`npm run format` to fix)              |
| `npm run build`        | Production build to `dist/`                           |
| `npm run db:start`     | Local Supabase in Docker (`db:stop` to stop it)       |
| `npm run db:test`      | pgTAP tests against the local database                |
| `npm run db:reset`     | Rebuild the local database from the migrations        |

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and every push to `main`,
in stages that each wait for the one before:

1. **static**: dependency audit, lint, typecheck, format check.
2. **unit** and **database**: Vitest with coverage (report uploaded, totals in
   the run summary), and the pgTAP tests against a fresh local database.
3. **e2e**: Playwright on Chromium (report uploaded when a test fails).
4. **build**: the production build.
5. **deploy**: a gate that records the GitHub Environment, `staging` for pull
   requests and `production` for `main`.

Netlify's Git integration does the deploying: it builds a deploy preview for
each pull request and publishes production from `main`. Actions does not
deploy, so nothing is published twice; branch protection that requires the
`deploy` check keeps unchecked code off `main`.

## API

The API (`GET /api/health`, `POST /api/chat`, `POST /api/fetch-link`) is
described in [`docs/api/openapi.yaml`](docs/api/openapi.yaml) (OpenAPI 3.1),
including every error code and limit. `server/openapi-spec.test.ts` fails if
the routes or request schemas drift from it.

Chat and fetch-link need the signed-in user's Supabase access token as
`Authorization: Bearer <token>`; the server verifies it against the Supabase
project's signing keys and answers `401` without a valid one. Health is
public.

## Deploying to Netlify

Connect the repository in Netlify; `netlify.toml` sets the build command,
publish directory and functions directory. Which variables each environment
needs, which are public and which are secret, and where each is set, are in
[`docs/deployment.md`](docs/deployment.md).

## Contributing

Work follows Scrum on GitHub Issues with feature branches and pull requests;
see [`AGENTS.md`](AGENTS.md) for conventions.
