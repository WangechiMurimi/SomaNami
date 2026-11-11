import process from 'node:process'
import { createClaudeAnswerer } from './claude-answerer.ts'
import type { Answerer, Effort } from './claude-answerer.ts'

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']

/**
 * Builds the answerer from server environment variables, or returns `null`
 * when no API key is configured so the route can report that instead of
 * crashing at startup. Shared by the Express server and Netlify Functions.
 */
export function createAnswererFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Answerer | null {
  if (!env.ANTHROPIC_API_KEY) return null
  const effort = EFFORTS.find((level) => level === env.CLAUDE_EFFORT)
  return createClaudeAnswerer({
    model: env.CLAUDE_MODEL || undefined,
    effort,
  })
}
