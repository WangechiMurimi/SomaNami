import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { modelAnswerSchema, UpstreamError } from './answerer.ts'
import type { Answerer } from './answerer.ts'
import { buildMessages, SYSTEM_PROMPT } from './prompt.ts'

export const DEFAULT_MODEL = 'claude-opus-5-5'

// Grounded Q&A over a few short passages: `medium` (Opus 5.5's default, set
// explicitly so a model change can't silently alter it) balances faithfulness
// against the latency budget of a serverless function.
export type Effort = 'low' | 'medium' | 'high'
export const DEFAULT_EFFORT: Effort = 'medium'

export interface ClaudeAnswererOptions {
  client?: Pick<Anthropic, 'beta'>
  model?: string
  effort?: Effort
}

/** Builds the answerer backed by the Claude API; local development only. */
export function createClaudeAnswerer({
  client = new Anthropic(),
  model = DEFAULT_MODEL,
  effort = DEFAULT_EFFORT,
}: ClaudeAnswererOptions = {}): Answerer {
  return async (request) => {
    let message
    try {
      message = await client.beta.messages.parse({
        model,
        max_tokens: 16_000,
        system: SYSTEM_PROMPT,
        messages: buildMessages(request),
        output_config: {
          effort,
          format: betaZodOutputFormat(modelAnswerSchema),
        },
        // On a safety decline, the API retries on a suitable fallback model
        // inside the same call instead of returning nothing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    } catch (error) {
      throw toUpstreamError(error)
    }

    if (message.stop_reason === 'refusal') return { kind: 'refusal' }
    if (!message.parsed_output) {
      // Hitting max_tokens mid-JSON is the realistic cause; surface it as an
      // upstream failure rather than an empty answer.
      throw new UpstreamError(
        'failed',
        `Claude returned no parseable answer (stop_reason: ${message.stop_reason})`,
      )
    }
    return { kind: 'answer', answer: message.parsed_output }
  }
}

/** Translates Anthropic SDK errors so the chat route stays provider-neutral. */
function toUpstreamError(error: unknown): UpstreamError {
  const options = { cause: error }
  if (error instanceof Anthropic.RateLimitError) {
    return new UpstreamError('rate-limited', 'Claude rate-limited us', options)
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new UpstreamError(
      'not-configured',
      'Claude API rejected the server credentials',
      options,
    )
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new UpstreamError('unreachable', 'Claude API unreachable', options)
  }
  return new UpstreamError('failed', 'Claude API call failed', options)
}
