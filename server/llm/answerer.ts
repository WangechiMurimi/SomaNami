import { z } from 'zod'
import type { HistoryTurn, Passage } from '../../src/types/contracts.ts'

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

/**
 * What the model is asked: the question, the passages the server retrieved
 * for it from the user's own materials, and the recent conversation.
 */
export interface AnswerRequest {
  question: string
  passages: Passage[]
  history: HistoryTurn[]
}

/** Answers one grounded question; the chat route depends only on this. */
export type Answerer = (request: AnswerRequest) => Promise<AnswerOutcome>

/**
 * Why a provider call failed, in terms the chat route can map to a status
 * without knowing which provider it was talking to.
 */
export type UpstreamFailure =
  'rate-limited' | 'not-configured' | 'unreachable' | 'timeout' | 'failed'

/**
 * A provider-neutral upstream failure. Messages must never contain
 * credentials: the chat route logs them.
 */
export class UpstreamError extends Error {
  readonly kind: UpstreamFailure

  constructor(kind: UpstreamFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UpstreamError'
    this.kind = kind
  }
}
