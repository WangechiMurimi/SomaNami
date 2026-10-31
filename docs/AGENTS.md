## Core Principles
1. **Code Quality:** Produce maintainable, readable, production-ready code that follows established project standards.
2. **UI Quality:** Build polished, cohesive, and distinctive interfaces using Tailwind CSS. Avoid generic default styling and prioritize visual consistency, usability, responsiveness, and accessibility.
3. **Test-Driven:** No feature is considered complete without automated tests.
4. **Collaborative Workflow:** Strictly use Scrum on GitHub Issues and standard feature branch/Pull Request workflows.
5. **Incremental Commits:** Commit code often to establish valid development checkpoints. Specifically, a commit must be made every time a major feature (or sub-component) is completed.

## Layout
The project lives at the repository root. Folders marked *(planned)* don't exist yet; create them when first needed.

```
├── src/
│   ├── main.jsx        # entry point
│   ├── App.jsx         # root component
│   ├── assets/         # images bundled by Vite
│   ├── components/     # reusable UI (planned)
│   ├── features/       # feature modules, one folder per feature (planned)
│   ├── lib/            # shared utilities, API clients (planned)
│   ├── llm/            # model adapters, prompts, retrieval (planned)
│   └── types/          # shared types (planned)
├── public/             # static assets served as-is
├── tests/              # e2e tests (planned); unit tests are colocated in src/
├── docs/
│   ├── AGENTS.md       # this file
│   ├── PRD.md
│   └── DESIGN.md
├── CLAUDE.md           # points to docs/AGENTS.md
├── index.html
├── vite.config.js
├── eslint.config.js
├── package.json
└── README.md
```

## Tech Stack
- **Frontend Framework:** React.js + Vite
- **Styling:** Tailwind CSS 
- **Backend:** Node.js + Express
- **Database Backend:** PostgreSQL + Supabase
- **Deployment:** Netlify
- **CI/CD:** GitHub Actions

## Coding standards
1. **Naming Conventions**:
	- **Files:** `kebab-case.ts` ; Components: `PascalCase.tsx` 
	- **Variables and functions:** Use `camelCase`; Constants: `UPPER_SNAKE_CASE
	- **Branch Naming:**  `type/<issue-number>-<short-description>`
	- **Commit Format:** `<type>(<scope>): <summary> (#<issue>)`
2. **Formatting and linting:** Use Prettier and ESLint. Run both before every commit.
3. **Comments:** Explain _why_ rather than _what_. Public functions get a one-line doc comment.
4. **Code quality:** Remove unused imports, variables, and dead code. Avoid unnecessary duplication.
5. **Testing strategy:**
	- **Framework:** Vitest for unit and integration; **End-to-end:** Playwright
	- **Tests:** Follow `[name].test.[ext]` and colocate unit tests with their corresponding source files.
	- **Coverage target:** Aim for at least 80% coverage of critical application logic.

## Workflow Execution Rules for Agents
1. **Planning & Execution:**
	- Before starting a non-trivial task, state: (1) your understanding of the request, (2) the steps you'll take, (3) what the result should look like. 
	- Seek clarification when requirements conflict or an important decision is unresolved.
	- For substantial changes, identify affected components and dependencies before coding.
	- Prefer small, reviewable diffs over large rewrites. 
	- Preserve existing behavior and avoid unrelated refactoring.
2. **References:**
	- Consult relevant sources before implementation:
	    - **PRD:** `docs/PRD.md`
	    - **Design Specifications:** `docs/DESIGN.md`
	    - **Architecture Decisions:** `docs/architecture/` (planned)
	    - **Workflow:** GitHub Projects
	- Report missing references rather than assuming requirements. 
3. **Issue Tracking:** 
	- Ensure every feature or significant change is linked to an existing GitHub Issue. If no issue exists, create or flag one before implementation.
	- Every `TODO` must reference a GitHub issue using the format `TODO(#42)`.
4. **Verification:** 
	- Prioritize accuracy over agreement. Communicate uncertainty openly and challenge flawed assumptions with clear, constructive reasoning.
	- Run relevant automated tests and checks before reporting completion. 
	- Clearly disclose any tests that could not be executed or did not pass.
5. **Security and Scope:**
	- Don't commit secrets, `.env` files, or user documents.
	- Don't call external services from the client for anything that handles user documents unless the PRD allows it.


