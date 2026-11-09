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

CI runs lint, typecheck, format check, tests and build on every pull request.

## Deploying to Netlify

Connect the repository in Netlify; `netlify.toml` sets the build command,
publish directory and functions directory. Set `ANTHROPIC_API_KEY` in the
site's environment variables (optionally `CLAUDE_MODEL`, `CLAUDE_EFFORT`).

## Contributing

Work follows Scrum on GitHub Issues with feature branches and pull requests;
see [`AGENTS.md`](AGENTS.md) for conventions.
