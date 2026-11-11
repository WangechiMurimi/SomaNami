// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from '../../src/types/contracts.ts'
import { createClaudeAnswerer, DEFAULT_MODEL } from './claude-answerer.ts'
import { SYSTEM_PROMPT } from './prompt.ts'

const request: ChatRequest = {
  question: 'Why ATP?',
  passages: [
    {
      documentId: 'doc-1',
      chunkId: 'doc-1:0',
      text: 'Mitochondria produce ATP.',
      source: { type: 'page', page: 1 },
    },
  ],
  history: [],
}

const EMPTY = { answer: '', answerable: false, citations: [] }

/** A stand-in for the SDK client exposing only `beta.messages.parse`. */
function fakeClient(reply: { stop_reason: string; parsed_output: unknown }) {
  const parse = vi.fn().mockResolvedValue(reply)
  // Deliberately partial: the answerer only touches `beta.messages.parse`.
  const client = { beta: { messages: { parse } } } as unknown as Pick<
    Anthropic,
    'beta'
  >
  return { client, parse }
}

describe('createClaudeAnswerer', () => {
  it('returns the parsed structured answer', async () => {
    const parsed = { answer: 'ATP.', answerable: true, citations: ['doc-1:0'] }
    const { client } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: parsed,
    })

    await expect(createClaudeAnswerer({ client })(request)).resolves.toEqual({
      kind: 'answer',
      answer: parsed,
    })
  })

  it('sends the fixed system prompt, the default model, an explicit effort and fallbacks', async () => {
    const { client, parse } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: EMPTY,
    })

    await createClaudeAnswerer({ client })(request)

    const params = parse.mock.calls[0]?.[0]
    expect(params).toMatchObject({
      model: DEFAULT_MODEL,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    })
    expect(params.output_config.format).toBeDefined()
    expect(params.messages.at(-1).content).toContain('Why ATP?')
  })

  it('honours a model and effort override', async () => {
    const { client, parse } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: EMPTY,
    })

    await createClaudeAnswerer({ client, model: 'claude-x', effort: 'low' })(
      request,
    )

    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-x',
      output_config: { effort: 'low' },
    })
  })

  it('reports a safety refusal as its own outcome', async () => {
    const { client } = fakeClient({
      stop_reason: 'refusal',
      parsed_output: null,
    })

    await expect(createClaudeAnswerer({ client })(request)).resolves.toEqual({
      kind: 'refusal',
    })
  })

  it('throws when the reply has no parseable answer', async () => {
    const { client } = fakeClient({
      stop_reason: 'max_tokens',
      parsed_output: null,
    })

    await expect(createClaudeAnswerer({ client })(request)).rejects.toThrow(
      /max_tokens/,
    )
  })
})
