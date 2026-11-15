import process from 'node:process'
import type { Answerer } from './answerer.ts'
import { createClaudeAnswerer } from './claude-answerer.ts'
import type { Effort } from './claude-answerer.ts'
import { createOllamaAnswerer } from './ollama-answerer.ts'

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']

export type LlmProvider = 'ollama' | 'claude'
export const DEFAULT_PROVIDER: LlmProvider = 'ollama'

/**
 * Builds the answerer from server environment variables, or returns `null`
 * when the chosen provider is not configured (or not allowed here) so the
 * route can report that instead of crashing at startup. Shared by the
 * Express server and Netlify Functions.
 */
export function createAnswererFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Answerer | null {
  const provider = (env.LLM_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase()
  switch (provider) {
    case 'ollama':
      return ollamaFromEnv(env)
    case 'claude':
      return claudeFromEnv(env)
    default:
      console.warn(
        `Unknown LLM_PROVIDER "${provider}" (expected ollama or claude); chat is disabled`,
      )
      return null
  }
}

function ollamaFromEnv(env: NodeJS.ProcessEnv): Answerer | null {
  if (!env.OLLAMA_BASE_URL) return null
  const timeoutMs = Number(env.OLLAMA_TIMEOUT_MS)
  return createOllamaAnswerer({
    baseUrl: env.OLLAMA_BASE_URL,
    apiKey: env.OLLAMA_API_KEY || undefined,
    model: env.OLLAMA_MODEL || undefined,
    timeoutMs:
      Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
  })
}

function claudeFromEnv(env: NodeJS.ProcessEnv): Answerer | null {
  // Learner documents must only reach our own model in production (#149).
  // Netlify sets CONTEXT; refusing here keeps a stray LLM_PROVIDER from
  // sending passages to a third party.
  if (env.CONTEXT === 'production') {
    console.warn(
      'LLM_PROVIDER=claude is for local development only and is refused in production; chat is disabled',
    )
    return null
  }
  if (!env.ANTHROPIC_API_KEY) return null
  const effort = EFFORTS.find((level) => level === env.CLAUDE_EFFORT)
  return createClaudeAnswerer({
    model: env.CLAUDE_MODEL || undefined,
    effort,
  })
}
