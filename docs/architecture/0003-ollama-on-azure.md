# ADR 0003: Answer with our own Ollama model on an Azure CPU VM

- **Status:** Accepted. Not yet on `main`: the work is in open PRs #195 (answerer), #196 (embeddings), #197 (provisioning), #198 (gateway) and #202 (wake on request). Where the chat API runs is still open (see below).
- **Date:** 2026-11-14
- **Issues:** epic #149; #150–#153, #201
- **Operating detail:** `infra/azure/README.md` (VM sizes, quotas, prices, NSG rules, scripts)

## Context

SomaNami promises that answers come from a model we run, using only what the learner provided (#143, #149). No third-party model provider may see learners' documents. Claude is for local development only.

Constraints:
- An Azure for Students budget, about USD 100 a year, with small vCPU quotas and no GPUs.
- A synchronous Netlify Function gets about 10 s per request.
- Every request carries learner passages, so nothing on the inference path may store or log them.

## Decision

- **One Ubuntu 24.04 CPU VM runs Ollama**, with `qwen2.5:3b` for chat and `nomic-embed-text` for embeddings.
  - It defaults to `Standard_D4s_v5` (4 vCPU, 16 GiB) in `eastus2`.
  - `Standard_D8s_v5` is the upgrade if measurements call for it.
- **The gateway:**
  - Ollama listens on loopback only.
  - Caddy on port 443 terminates TLS, using the Azure DNS label and a Let's Encrypt certificate.
  - Caddy requires a bearer token, and forwards only `/api/chat`, `/api/embed` and `/api/tags`.
- **The token never enters the repo.** It is generated on the operator's machine and kept on the VM in a root-only file.
- **Nothing keeps learner text.** The VM has no database and writes no files. Caddy has no access log. `OLLAMA_DEBUG` stays off.
- **Cost control.** A daily auto-shutdown deallocates the VM. #201 adds starting it on request and deallocating it when idle.
- **Grounding is enforced in our code**, not trusted to a small model (ADR 0007).

## Open question: where the chat API runs

- **Option A (the default):** the Netlify Function calls the VM. Keep it if the warm p95 latency is under about 8 s.
- **Option B:** run the Express chat API on the VM. Choose it if the p95 stays at 8 s or more after the cheaper levers:
  - fewer or shorter passages;
  - capping `num_predict`;
  - keeping the model loaded;
  - the D8s_v5 upgrade.

  The cost of Option B: the VM then holds Supabase settings, verifies sessions itself, is called directly by the browser (so the CSP must allow it), and its uptime becomes chat's uptime.

Measure with `infra/azure/measure-latency.mjs`, then add a "Measurement" section here with the results.

## Consequences

- The privacy promise doesn't depend on a third party's data terms.
- A 3B model answers less well than a frontier model, so grounding checks live in code.
- We become operators: reboots, model updates, basic monitoring.
- Chat is down while the VM is deallocated, until it wakes. The answerer must report "model unavailable" cleanly.
- One VM and one model process limit concurrency. That's fine for this project, but it doesn't scale.

## Alternatives considered

- **Azure OpenAI / AI Foundry.** A third party runs the model under its own terms, and abuse monitoring may keep prompts.
- **A GPU VM.** No GPU quota on student subscriptions, and the cost would use the credit in days.
- **Azure Container Apps.** No GPU on consumption plans, and a cold start loading a multi-GB model misses the 10 s limit.
- **Ollama inside a Netlify Function.** The bundle, memory and time limits are far too small.
- **Expose Ollama behind an IP allowlist.** Netlify has no fixed egress IPs, and Ollama has no auth or TLS of its own.
