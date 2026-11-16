import { z } from 'zod'
import { modelAnswerSchema, UpstreamError } from './answerer.ts'
import type { Answerer, ModelAnswer } from './answerer.ts'
import { buildMessages, SYSTEM_PROMPT } from './prompt.ts'

/** A small model that answers on a CPU-only VM within our credit budget. */
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b'

/** Netlify's default time limit for a synchronous function. */
export const NETLIFY_FUNCTION_LIMIT_MS = 10_000

/**
 * The whole answer, retry included, must finish inside the function limit.
 * Before the model call the chat route verifies the session and loads the
 * learner's materials from Supabase (#148), and a cold start comes first, so
 * 3 s is left for those and for sending the JSON reply.
 */
export const DEFAULT_OLLAMA_TIMEOUT_MS = NETLIFY_FUNCTION_LIMIT_MS - 3_000

/** Caps generation: a grounded answer to one question needs little room. */
export const MAX_ANSWER_TOKENS = 512

// Small models sometimes emit malformed JSON despite the schema constraint;
// one retry recovers most of those without blowing the time budget.
const MAX_ATTEMPTS = 2

/**
 * The JSON schema Ollama constrains generation to. `$schema` is dropped
 * because Ollama only needs the shape, and the draft URI adds nothing.
 */
export const ANSWER_FORMAT = (() => {
  const schema = z.toJSONSchema(modelAnswerSchema)
  delete schema.$schema
  return schema
})()

const ollamaReplySchema = z.object({
  message: z.object({ content: z.string() }),
})

export interface OllamaAnswererOptions {
  /** Where the Ollama server listens, e.g. `http://localhost:11434`. */
  baseUrl: string
  /** Sent as a bearer token when set, for the Ollama gateway (#151). */
  apiKey?: string
  model?: string
  /** Deadline for the whole answer, retry included. */
  timeoutMs?: number
  /** Injected in tests; defaults to the global `fetch`. */
  fetch?: typeof fetch
}

/** Builds the default answerer, backed by our self-hosted Ollama server. */
export function createOllamaAnswerer({
  baseUrl,
  apiKey,
  model = DEFAULT_OLLAMA_MODEL,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  fetch: fetchImpl = fetch,
}: OllamaAnswererOptions): Answerer {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  // Ollama error bodies are not ours to vouch for; never let a key that a
  // proxy might echo back reach an error message, since those get logged.
  const redact = (text: string) =>
    apiKey ? text.split(apiKey).join('[redacted]') : text

  return async (request) => {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...buildMessages(request),
      ],
      stream: false,
      format: ANSWER_FORMAT,
      // Temperature 0 keeps answers close to the passages and repeatable.
      options: { temperature: 0, num_predict: MAX_ANSWER_TOKENS },
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      for (let attempt = 1; ; attempt++) {
        const content = await chat(controller.signal)
        const answer = parseAnswer(content)
        if (answer) return { kind: 'answer', answer }
        if (attempt >= MAX_ATTEMPTS) {
          throw new UpstreamError(
            'failed',
            `Ollama returned no valid answer after ${MAX_ATTEMPTS} attempts`,
          )
        }
      }
    } finally {
      clearTimeout(timer)
    }

    /** One round trip to Ollama; returns the raw message content. */
    async function chat(signal: AbortSignal): Promise<string> {
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers,
          body,
          signal,
        })
      } catch (error) {
        throw transportError(error, signal)
      }

      if (!response.ok) {
        throw statusError(response.status, await errorDetail(response))
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch (error) {
        if (signal.aborted) throw transportError(error, signal)
        throw new UpstreamError('failed', 'Ollama replied with invalid JSON')
      }
      const reply = ollamaReplySchema.safeParse(payload)
      if (!reply.success) {
        throw new UpstreamError('failed', 'Ollama reply has no message content')
      }
      return reply.data.message.content
    }
  }

  function transportError(error: unknown, signal: AbortSignal) {
    if (signal.aborted) {
      return new UpstreamError(
        'timeout',
        `Ollama did not answer within ${timeoutMs} ms`,
      )
    }
    return new UpstreamError('unreachable', 'Ollama is unreachable', {
      cause: error,
    })
  }

  async function errorDetail(response: Response): Promise<string> {
    try {
      return redact((await response.text()).slice(0, 200))
    } catch {
      return ''
    }
  }
}

/** Parses and validates the model's JSON, or `null` so the caller retries. */
function parseAnswer(content: string): ModelAnswer | null {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return null
  }
  const parsed = modelAnswerSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

function statusError(status: number, detail: string): UpstreamError {
  const message = `Ollama answered ${status}${detail ? `: ${detail}` : ''}`
  // The gateway rejected our key: a server configuration problem.
  if (status === 401 || status === 403) {
    return new UpstreamError('not-configured', message)
  }
  // Ollama answers 503 when its request queue is full.
  if (status === 429 || status === 503) {
    return new UpstreamError('rate-limited', message)
  }
  return new UpstreamError('failed', message)
}
