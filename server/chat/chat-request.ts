import { z } from 'zod'
import type { ChatRequest } from '../../src/types/contracts.ts'

// Bounds keep one request's prompt (and its cost) predictable. The client
// retrieves at most a handful of chunks of at most MAX_CHUNK_CHARS each, so
// these leave headroom without letting a caller post an entire book.
export const LIMITS = {
  questionChars: 2_000,
  passages: 12,
  passageChars: 4_000,
  /** Most recent turns kept as context; older ones are dropped, not rejected. */
  historyTurns: 20,
  /** Longer turns are shortened to this; history is context, not evidence. */
  historyTurnChars: 8_000,
  /** Hard cap on what a client may send before trimming. */
  historyTurnsAccepted: 500,
} as const

const source = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page'), page: z.number().int().positive() }),
  z.object({
    type: z.literal('paragraph'),
    paragraph: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('line'),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
])

const chatRequest = z.object({
  question: z.string().trim().min(1).max(LIMITS.questionChars),
  passages: z
    .array(
      z.object({
        documentId: z.string().min(1),
        chunkId: z.string().min(1),
        text: z.string().max(LIMITS.passageChars),
        source,
      }),
    )
    .max(LIMITS.passages)
    .default([]),
  // A long study session must keep working, so history is trimmed to a
  // budget instead of failing validation once the conversation grows.
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .max(LIMITS.historyTurnsAccepted)
    .default([])
    .transform((turns) =>
      turns.slice(-LIMITS.historyTurns).map(({ role, content }) => ({
        role,
        content:
          content.length > LIMITS.historyTurnChars
            ? `${content.slice(0, LIMITS.historyTurnChars)}…`
            : content,
      })),
    ),
})

export type ParsedChatRequest =
  { ok: true; request: ChatRequest } | { ok: false; issues: string[] }

/** Validates an untrusted `POST /api/chat` body against the `ChatRequest` contract. */
export function parseChatRequest(body: unknown): ParsedChatRequest {
  const result = chatRequest.safeParse(body)
  if (result.success) return { ok: true, request: result.data }
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`,
    ),
  }
}
