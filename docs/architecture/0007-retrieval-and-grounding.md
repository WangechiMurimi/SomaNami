# ADR 0007: Retrieve on the server with BM25; enforce grounding in code

- **Status:** Accepted. Vector search is planned (#153, #154).
- **Date:** recorded 2026-11-16; built in #148 (PR #172) and refined in #207 (PR #208)
- **Issues:** #148, #207, US-02, US-07

## Context

Answers must come only from the learner's chosen sources, and must say so when the sources don't cover a question. The production model is small (ADR 0003), so it can't be trusted to stay grounded on its own.

## Decision

1. **The client sends material ids, not text.** The server loads those materials' chunks as the learner (ADR 0005) and ranks them. Retrieval code is shared with the client (`src/lib/retrieval/`).
2. **Ranking is BM25** (k1 = 1.5, b = 0.75) with a relevance floor. At most 5,000 chunks are ranked per request, to bound memory and time.
3. **When strict BM25 finds nothing, the model judges coverage** (`select-passages.ts`). It gets the closest loose matches, using the previous turn to resolve follow-ups, plus the opening of each material, up to 8 passages. Questions like "summarize this" or "quiz me" still get answers, without a keyword floor rejecting them.
4. **The answer has a schema:** `answer`, `answerable`, `citations`.
5. **Citations are checked in code.**
   - Only cited ids that match passages actually sent survive.
   - An answer counts as answerable only if at least one citation survives, whatever the model claims.
   - With no passages, or on a refusal, the server returns a fixed "not in your sources" answer.

## Consequences

- Grounding holds even with a weak model, because the code decides what is shown as sourced.
- BM25 misses paraphrases. The fallback in step 3 covers common cases; embeddings (#153, #154) are the planned fix.
- Loading every chunk of the chosen materials per request bounds library size. That is acceptable at current scale, and vector search in the database removes the limit.

## Alternatives considered

- **Retrieve in the browser and send passages.** It worked before accounts. But it trusts the client to send real passages from the learner's materials, and it ships text the server can load itself.
- **Trust the model's own `answerable` flag.** Rejected for a 3B model.
- **A hard keyword floor.** Used before #207; it rejected valid requests that don't repeat the material's words.
