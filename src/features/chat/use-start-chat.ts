import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createConversation } from '../../lib/storage/index.ts'
import { chatPath, titleFrom } from './conversation-materials.ts'

/** What a new chat starts with: where it lives, what it uses, what to ask. */
export interface NewChat {
  workspaceId: string
  materialIds: string[]
  question: string
}

/**
 * Starts a chat from a question: creates the conversation, then opens it with
 * the question so the chat page asks it straight away. `starting` stays true
 * once it succeeds, so a second send can't start a second chat while the page
 * changes.
 */
export function useStartChat() {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async ({ workspaceId, materialIds, question }: NewChat) => {
    setStarting(true)
    setError(null)
    try {
      const conversation = await createConversation({
        workspaceId,
        materialIds,
        // TODO(#178): let the LLM title the chat from its first question.
        title: titleFrom(question),
      })
      navigate(chatPath(conversation), { state: { question: question.trim() } })
    } catch (cause) {
      console.error('Could not start the chat', cause)
      setError('We couldn’t start this chat. Try again.')
      setStarting(false)
    }
  }

  return { start, starting, error }
}
