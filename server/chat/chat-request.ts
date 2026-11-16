import { z } from 'zod'
import type { ChatRequest } from '../../src/types/contracts.ts'

// Bounds keep one request's prompt (and its cost) predictable.
export const LIMITS = {
  questionChars: 2_000,
  /**
   * Materials one conversation may draw on. Far above what a learner picks
   * for one chat, while keeping the database `in (...)` list small.
   */
  materialIds: 50,
  /** Client ids are short (`doc-…`, UUIDs); this only rejects junk. */
  materialIdChars: 200,
  /** Most recent turns kept as context; older ones are dropped, not rejected. */
  historyTurns: 20,
  /** Longer turns are shortened to this; history is context, not evidence. */
  historyTurnChars: 8_000,
  /** Hard cap on what a client may send before trimming. */
  historyTurnsAccepted: 500,
} as const

const chatRequest = z.object({
  question: z.string().trim().min(1).max(LIMITS.questionChars),
  // Required, so a client still sending the old `passages` shape gets a 400
  // instead of a misleading "not covered". Duplicates ask for nothing new, so
  // they are dropped rather than rejected.
  materialIds: z
    .array(z.string().min(1).max(LIMITS.materialIdChars))
    .max(LIMITS.materialIds)
    .transform((ids) => [...new Set(ids)]),
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
