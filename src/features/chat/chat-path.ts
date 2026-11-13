import type { Conversation } from '../../types/contracts.ts'

/**
 * Where a saved conversation opens. The chat screen is still addressed by
 * material, so this goes through the conversation's first one.
 * TODO(#31): address chats by conversation id.
 */
export function chatPath(conversation: Conversation): string {
  const [first] = conversation.materialIds
  return first ? `/chat/${first}` : '/conversations'
}
