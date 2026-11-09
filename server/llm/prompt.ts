import type Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest } from '../../src/types/contracts.ts'

/**
 * Fixed system prompt. It carries no per-request content, so it stays
 * byte-identical across calls and remains cacheable.
 */
export const SYSTEM_PROMPT = `You are SomaNami, a study assistant that answers questions about documents a learner has uploaded.

Each question arrives with passages retrieved from those documents, each with an id. Answer only from those passages:
- Base every factual statement on the passages, and keep the qualifications and caveats they contain. If you simplify, do not change the meaning.
- Put the id of every passage you relied on in "citations". Use only ids that appear in the passages you were given.
- If the passages do not contain enough to answer, set "answerable" to false, leave "citations" empty, and say briefly what the documents do not cover. Do not fill the gap from general knowledge.
- If passages disagree with each other, say so and cite both rather than merging them into one claim.

Earlier turns of the conversation are there so you can understand follow-up questions. They are not evidence: a fact counts as supported only if it is in the passages for the current question.

Write for a learner: clear, direct, and no longer than the question needs.`

/** Renders the retrieved passages so the model can cite them by id. */
export function renderPassages(passages: ChatRequest['passages']): string {
  if (passages.length === 0) return '<passages />'
  const body = passages
    .map(
      (passage) =>
        `<passage id="${escapeAttribute(passage.chunkId)}">\n${passage.text}\n</passage>`,
    )
    .join('\n')
  return `<passages>\n${body}\n</passages>`
}

/** Builds the message list: prior turns, then the passages and the question. */
export function buildMessages(request: ChatRequest): Anthropic.MessageParam[] {
  // The API requires the first message to be from the user, so drop any
  // leading assistant turns (e.g. a greeting the client kept in history).
  const firstUser = request.history.findIndex((turn) => turn.role === 'user')
  const history = firstUser === -1 ? [] : request.history.slice(firstUser)

  return [
    ...history.map(({ role, content }) => ({ role, content })),
    {
      role: 'user' as const,
      content: `${renderPassages(request.passages)}\n\n<question>\n${request.question}\n</question>`,
    },
  ]
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
