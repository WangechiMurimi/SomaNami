import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { ChatRequest } from '../../src/types/contracts.ts'
import { buildMessages, SYSTEM_PROMPT } from './prompt.ts'

export const DEFAULT_MODEL = 'claude-opus-5-5'

// Grounded Q&A over a few short passages: `medium` (Opus 5.5's default, set
// explicitly so a model change can't silently alter it) balances faithfulness
// against the latency budget of a serverless function.
export type Effort = 'low' | 'medium' | 'high'
export const DEFAULT_EFFORT: Effort = 'medium'

/** What the model returns; ids are chunk ids, validated by the caller. */
export const modelAnswerSchema = z.object({
  answer: z.string(),
  answerable: z.boolean(),
  citations: z.array(z.string()),
})

export type ModelAnswer = z.infer<typeof modelAnswerSchema>

export type AnswerOutcome =
  | { kind: 'answer'; answer: ModelAnswer }
  // The model declined on safety grounds; there is no answer to show.
  | { kind: 'refusal' }

/** Answers one grounded question; the chat route depends only on this. */
export type Answerer = (request: ChatRequest) => Promise<AnswerOutcome>

export interface ClaudeAnswererOptions {
  client?: Pick<Anthropic, 'beta'>
  model?: string
  effort?: Effort
}

/** Builds the production answerer backed by the Claude API. */
export function createClaudeAnswerer({
  client = new Anthropic(),
  model = DEFAULT_MODEL,
  effort = DEFAULT_EFFORT,
}: ClaudeAnswererOptions = {}): Answerer {
  return async (request) => {
    const message = await client.beta.messages.parse({
      model,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      messages: buildMessages(request),
      output_config: { effort, format: betaZodOutputFormat(modelAnswerSchema) },
      // On a safety decline, the API retries on a suitable fallback model
      // inside the same call instead of returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })

    if (message.stop_reason === 'refusal') return { kind: 'refusal' }
    if (!message.parsed_output) {
      // Hitting max_tokens mid-JSON is the realistic cause; surface it as an
      // upstream failure rather than an empty answer.
      throw new Error(
        `Claude returned no parseable answer (stop_reason: ${message.stop_reason})`,
      )
    }
    return { kind: 'answer', answer: message.parsed_output }
  }
}
