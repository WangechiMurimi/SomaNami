import { useState } from 'react'
import { setConversationSaved } from '../../lib/storage/index.ts'
import type { Conversation } from '../../types/contracts.ts'
import { Bookmark } from './chat-icons.tsx'

/**
 * Saves a chat to Saved conversations, or takes it out. The button shows the
 * new state at once and goes back if storing it fails.
 */
export default function SaveToggle({
  conversation,
}: {
  conversation: Pick<Conversation, 'id' | 'saved'>
}) {
  const [saved, setSaved] = useState(conversation.saved === true)
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    const next = !saved
    setSaved(next)
    setFailed(false)
    setConversationSaved(conversation.id, next).catch((error: unknown) => {
      console.error('Could not save the chat', error)
      setSaved(!next)
      setFailed(true)
    })
  }

  return (
    <div className="flex flex-none items-center gap-2">
      {failed && (
        <span role="alert" className="text-[13px] text-warn">
          Couldn’t update. Try again.
        </span>
      )}
      <button
        type="button"
        aria-pressed={saved}
        onClick={toggle}
        className={`inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium ${
          saved
            ? 'border-accent bg-tint text-accent'
            : 'border-edge bg-surface text-fg hover:bg-tint'
        }`}
      >
        <Bookmark size={15} strokeWidth={2} filled={saved} />
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
