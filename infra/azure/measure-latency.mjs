#!/usr/bin/env node
// Measures grounded-chat latency against the Ollama gateway so ADR 0003 can
// settle where the chat API runs (Netlify Function vs. the VM itself).
//
// Usage (Git Bash, from the repo root; Node 22.18+ for .ts imports):
//   OLLAMA_BASE_URL=https://<label>.<region>.cloudapp.azure.com \
//   OLLAMA_API_KEY=<token> node infra/azure/measure-latency.mjs
//
// Optional: RUNS (default 20), OLLAMA_MODEL (default qwen2.5:3b),
// OLLAMA_TIMEOUT_MS (budget to compare against, default 8500),
// COLD=0 to skip unloading the model before the first request.
import process from 'node:process'
import { performance } from 'node:perf_hooks'
// The production prompt, so token counts match what the server sends. Node
// loads the .ts file through type stripping, as the dev server does.
import { SYSTEM_PROMPT, renderPassages } from '../../server/llm/prompt.ts'

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.OLLAMA_API_KEY ?? ''
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
const RUNS = Number.parseInt(process.env.RUNS ?? '20', 10)
const BUDGET_MS = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '8500', 10)
const MEASURE_COLD = process.env.COLD !== '0'
// Generous so slow runs are measured rather than cut off.
const REQUEST_TIMEOUT_MS = 120_000

if (!BASE_URL || !API_KEY) {
  console.error('Set OLLAMA_BASE_URL and OLLAMA_API_KEY first.')
  process.exit(2)
}
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error('RUNS must be a positive integer.')
  process.exit(2)
}

// Same shape as modelAnswerSchema in server/llm/claude-answerer.ts.
const ANSWER_FORMAT = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    answerable: { type: 'boolean' },
    citations: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'answerable', 'citations'],
}

const PASSAGES = [
  {
    chunkId: 'bio-ch3-p12',
    text: 'Photosynthesis takes place in the chloroplasts. In the light-dependent reactions, chlorophyll in the thylakoid membranes absorbs light energy, which is used to split water molecules, releasing oxygen as a by-product and producing ATP and NADPH.',
  },
  {
    chunkId: 'bio-ch3-p13',
    text: 'The Calvin cycle (the light-independent reactions) happens in the stroma. It uses the ATP and NADPH from the light-dependent reactions to fix carbon dioxide into glucose. The enzyme RuBisCO catalyses the first step, attaching CO2 to ribulose bisphosphate.',
  },
  {
    chunkId: 'bio-ch3-p14',
    text: 'The rate of photosynthesis is limited by whichever factor is in shortest supply: light intensity, carbon dioxide concentration, or temperature. Above roughly 40 degrees Celsius the rate falls because enzymes such as RuBisCO begin to denature.',
  },
]

// A mix of answerable and unanswerable questions, as learners would ask.
const QUESTIONS = [
  'Where does the Calvin cycle happen and what does it need?',
  'Why does photosynthesis slow down when it gets very hot?',
  'What is released when water is split during photosynthesis?',
  'How does cellular respiration differ from photosynthesis?',
]

async function call(path, body) {
  const started = performance.now()
  const response = await fetch(`${BASE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  const ms = performance.now() - started
  if (!response.ok)
    throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 200)}`)
  return { ms, json: text ? JSON.parse(text) : null }
}

async function groundedChat(question) {
  const { ms, json } = await call('/api/chat', {
    model: MODEL,
    stream: false,
    format: ANSWER_FORMAT,
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${renderPassages(PASSAGES)}\n\n<question>\n${question}\n</question>`,
      },
    ],
  })
  let parsed = null
  try {
    parsed = JSON.parse(json.message?.content ?? '')
  } catch {
    // Reported below as an invalid answer; the timing still counts.
  }
  const nsToMs = (ns) => (ns ?? 0) / 1e6
  return {
    ms,
    loadMs: nsToMs(json.load_duration),
    promptTokens: json.prompt_eval_count ?? 0,
    promptMs: nsToMs(json.prompt_eval_duration),
    outputTokens: json.eval_count ?? 0,
    outputMs: nsToMs(json.eval_duration),
    valid:
      parsed !== null &&
      typeof parsed.answer === 'string' &&
      typeof parsed.answerable === 'boolean' &&
      Array.isArray(parsed.citations),
  }
}

/** Nearest-rank percentile of an ascending-sorted array. */
function percentile(sorted, p) {
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ]
}

const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`
const median = (values) =>
  percentile(
    [...values].sort((a, b) => a - b),
    50,
  )

async function main() {
  console.log(
    `Gateway ${BASE_URL}, model ${MODEL}, ${RUNS} warm runs, budget ${BUDGET_MS} ms\n`,
  )

  // Network baseline: /api/tags does no inference.
  const tagTimes = []
  for (let i = 0; i < 5; i += 1) tagTimes.push((await call('/api/tags')).ms)
  const networkMs = median(tagTimes)
  console.log(`Network baseline (/api/tags median of 5): ${fmt(networkMs)}`)

  if (MEASURE_COLD) {
    // An empty message list with keep_alive 0 unloads the model, so the next
    // request includes the load time a learner sees after a restart.
    await call('/api/chat', { model: MODEL, messages: [], keep_alive: 0 })
  }
  const cold = await groundedChat(QUESTIONS[0])
  console.log(
    `${MEASURE_COLD ? 'Cold' : 'First'} request: ${fmt(cold.ms)} (model load ${fmt(cold.loadMs)})\n`,
  )

  const warm = []
  for (let i = 0; i < RUNS; i += 1) {
    const result = await groundedChat(QUESTIONS[i % QUESTIONS.length])
    warm.push(result)
    const tps =
      result.outputMs > 0 ? (result.outputTokens / result.outputMs) * 1000 : 0
    console.log(
      `  run ${String(i + 1).padStart(2)}: ${fmt(result.ms)}  ` +
        `prompt ${result.promptTokens} tok in ${fmt(result.promptMs)}, ` +
        `output ${result.outputTokens} tok at ${tps.toFixed(1)} tok/s` +
        (result.valid ? '' : '  [INVALID ANSWER JSON]'),
    )
  }

  const sorted = warm.map((r) => r.ms).sort((a, b) => a - b)
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)
  const overBudget = sorted.filter((ms) => ms > BUDGET_MS).length
  const invalid = warm.filter((r) => !r.valid).length
  const totalOut = warm.reduce((sum, r) => sum + r.outputTokens, 0)
  const totalOutMs = warm.reduce((sum, r) => sum + r.outputMs, 0)

  console.log('\nSummary')
  console.log(`  cold/first  ${fmt(cold.ms)}`)
  console.log(`  warm p50    ${fmt(p50)}`)
  console.log(`  warm p95    ${fmt(p95)}`)
  console.log(`  warm max    ${fmt(sorted[sorted.length - 1])}`)
  console.log(
    `  generation  ${totalOutMs > 0 ? ((totalOut / totalOutMs) * 1000).toFixed(1) : '?'} tok/s`,
  )
  console.log(`  over budget ${overBudget}/${RUNS} (> ${BUDGET_MS} ms)`)
  console.log(
    `  invalid     ${invalid}/${RUNS} answers failed the schema check`,
  )
  console.log(
    `  network     ${fmt(networkMs)} per round trip from here (subtract when far from the VM)`,
  )

  // ADR 0003: keep Option A (Netlify Function -> VM) while warm p95 < ~8 s.
  const verdict =
    p95 < 8000
      ? 'p95 < 8 s: Option A (Netlify Function -> VM) fits.'
      : 'p95 >= 8 s: trim prompt/num_predict or upsize first; otherwise Option B (API on the VM).'
  console.log(`\n${verdict}`)
}

main().catch((error) => {
  console.error(`\nMeasurement failed: ${error.message}`)
  process.exit(1)
})
