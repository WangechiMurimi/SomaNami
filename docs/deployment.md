# Deployment and environments

SomaNami deploys to Netlify. GitHub Actions checks every change; Netlify builds
and publishes it. No value or secret on this page lives in the repository:
each one is set in the Netlify UI, the GitHub UI or a local `.env` (see
`.env.example`).

## How a change reaches the site

| Event                  | GitHub Actions (`.github/workflows/ci.yml`)                     | Netlify (Git integration)                                 |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Pull request to `main` | All stages run; `deploy` records environment **`staging`**      | Builds a **deploy preview** at its own URL                |
| Push to `main` (merge) | All stages run again; `deploy` records environment **`production`** | Builds and publishes **production**                       |

Netlify starts its build when it sees the commit; it does not wait for
Actions. What keeps a broken change off production is branch protection on
`main`: a pull request can only merge once CI is green, so every commit
Netlify publishes from `main` has already passed every stage. The `deploy` job
is the last stage, so requiring it alone covers all the others.

### Why Actions does not deploy

Netlify's Git integration already builds deploy previews and production. A
second deploy from Actions with `netlify-cli` would publish each commit twice,
need a personal access token stored in GitHub, and split deploy settings across
two places. The `deploy` job therefore acts as a gate and a record: it ties
each run to a GitHub Environment so the environment's history shows what was
checked for staging and production.

If deploys ever move to Actions (for example, to stop Netlify publishing until
CI passes), turn off Netlify's automatic builds, add `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` as secrets of each GitHub Environment, and replace the
`deploy` job's step with `netlify deploy` (with `--prod` for `production`).

## Pipeline stages

1. **static**: `npm audit --audit-level=high`, lint, typecheck, Prettier check.
2. **unit** (after static): `npm run test:coverage`. The `coverage/` folder is
   uploaded as an artifact and the totals appear in the run summary.
3. **database** (after static): migrations and pgTAP tests against a
   throwaway local Postgres.
4. **e2e** (after unit): Playwright on Chromium. The HTML report is uploaded
   when a test fails.
5. **build** (after unit, database and e2e): `npm run build`.
6. **deploy** (after build): the gate described above.

## Environments and their variables

GitHub creates the `staging` and `production` environments the first time a
job names them. Neither needs secrets today, because Actions does not deploy.
The site's runtime values are set in Netlify under **Site configuration >
Environment variables**, scoped per deploy context: **Deploy Previews** is
staging, **Production** is production.

| Variable                        | Kind                                          | Staging (deploy previews)              | Production (`main`)                    |
| ------------------------------- | --------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`             | Public, baked into the browser bundle at build | Netlify, Deploy Previews context       | Netlify, Production context            |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public, baked into the browser bundle at build | Netlify, Deploy Previews context       | Netlify, Production context            |
| `VITE_TURNSTILE_SITE_KEY`       | Public, baked into the browser bundle at build | Netlify, Deploy Previews context       | Netlify, Production context            |
| `SUPABASE_URL`                  | Server-side Function env (optional; falls back to `VITE_SUPABASE_URL`) | Netlify, Deploy Previews context | Netlify, Production context |
| `SUPABASE_PUBLISHABLE_KEY`      | Server-side Function env (optional; falls back to `VITE_SUPABASE_PUBLISHABLE_KEY`). Public key, never a secret or service-role key | Netlify, Deploy Previews context | Netlify, Production context |
| `ANTHROPIC_API_KEY`             | **Secret**, server-side Functions only         | Netlify, Deploy Previews context, marked secret | Netlify, Production context, marked secret |
| `CLAUDE_MODEL`, `CLAUDE_EFFORT` | Server-side Function env, optional overrides  | Netlify, Deploy Previews context       | Netlify, Production context            |
| `PORT`                          | Local Express server only                     | Not used                               | Not used                               |

Notes:

- `VITE_*` values are read by `vite build`, so they must be present in the
  context Netlify builds in. They end up in public JavaScript; never give a
  `VITE_` name to anything secret.
- A Netlify variable's scopes must include **Functions** for the server-side
  ones, and **Builds** for the `VITE_*` ones.
- Turnstile's secret key and Google's OAuth client secret live in the Supabase
  dashboard, not in Netlify or GitHub.
- If staging and production use different Supabase projects, the
  `connect-src` entry in `netlify.toml`'s Content-Security-Policy must name
  both, or the browser cannot reach the one it was not written for.
- GitHub Environment secrets are only needed if deploys move to Actions:
  `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` in each environment. CI itself
  needs none; the e2e and build stages run without production keys.

## Setting it up by hand

These steps happen in the GitHub and Netlify UIs; nothing in this repository
changes them.

1. Netlify: connect the repository, keep **Deploy Previews** on for pull
   requests and production branch `main`.
2. Netlify: add the variables above for the Production and Deploy Previews
   contexts.
3. GitHub: in **Settings > Branches**, protect `main` and require the CI
   `deploy` check (it runs after every other stage).
4. GitHub (optional): in **Settings > Environments > production**, restrict
   deployment branches to `main` and add required reviewers if production
   runs should need an approval.
