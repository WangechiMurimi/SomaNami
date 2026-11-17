# Architecture decisions

Each ADR has Context, Decision, Consequences and Alternatives sections. When a decision changes, add a "Later changes" note, or write a new ADR that supersedes it.

| ADR | Decision | Status |
| --- | -------- | ------ |
| [0001](0001-auth-choices.md) | Google first, PKCE, details in `profiles`, no TOTP | Accepted |
| [0002](0002-hosting.md) | Netlify Functions over shared handlers; Express for local dev | Accepted |
| [0003](0003-ollama-on-azure.md) | Our own Ollama model on an Azure CPU VM | Accepted; in open PRs |
| [0004](0004-local-first-storage-and-sync.md) | Device-first storage, outbox sync, newer edit wins | Accepted |
| [0005](0005-learner-data-in-our-supabase.md) | Learner data only in our Supabase, owner-only RLS | Accepted |
| [0006](0006-parse-in-browser-fetch-links-on-server.md) | Parse in the browser; SSRF-safe link fetching on the server | Accepted |
| [0007](0007-retrieval-and-grounding.md) | Server-side BM25; grounding enforced in code | Accepted |
| [0008](0008-loose-chats-in-default-workspace.md) | Loose chats in a hidden default workspace | Accepted |
