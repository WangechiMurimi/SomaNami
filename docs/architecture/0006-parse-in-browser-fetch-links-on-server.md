# ADR 0006: Parse documents in the browser; fetch links on the server

- **Status:** Accepted
- **Date:** recorded 2026-11-16; links built in #93 (PRs #157–#161, #181)
- **Issues:** #93 (links), US-01

## Context

Learners add PDFs, Word files, pasted text and web links. Each becomes text split into chunks for retrieval. Parsing needs fairly heavy libraries, and fetching a URL from our server opens it to server-side request forgery (SSRF).

## Decision

1. **Files are parsed in the browser:**
   - `pdfjs-dist` for PDF;
   - `mammoth` for DOCX, loaded only when one is uploaded;
   - `@mozilla/readability` for HTML.

   The text is split into chunks of at most 1,200 characters and stored with the document.
2. **Links are fetched on the server and parsed in the browser.** `POST /api/fetch-link` returns the raw bytes, and the browser runs the same parsers it uses for files. The server never parses or keeps the page.
3. **The link fetcher is SSRF-safe:**
   - It accepts only http and https.
   - It resolves the address and refuses private, loopback and link-local ones. It connects to the address it checked, so DNS rebinding can't swap it.
   - It caps redirects, response size and total time.
   - It checks the content type and refuses video links.
   - It sends no cookies or credentials, requires a signed-in caller, and is rate limited.

## Consequences

- The server stays small and holds no parsing libraries. A parser bug can only affect the learner's own tab.
- Large PDFs cost the learner's device CPU time.
- Files and links share one parsing path, so a link becomes an ordinary material with `sourceUrl` and `fetchedAt`.
- Pages that need JavaScript to render, or that sit behind a login, can't be added.

## Alternatives considered

- **Parse on the server.** It would centralise parsing, but it needs larger Functions and would put learner text in server memory for longer.
- **Fetch links from the browser.** CORS blocks most sites.
