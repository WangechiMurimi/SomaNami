import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from '../../components/icons.tsx'
import { setConversationSaved } from '../../lib/storage/index.ts'
import { count } from '../../lib/text/count.ts'
import type { Conversation, StoredDocument } from '../../types/contracts.ts'
import { Bookmark, Chats, FileIcon } from '../chat/chat-icons.tsx'
import { chatPath, materialsFor } from '../chat/conversation-materials.ts'

/** The "N sources" chip on a chat row, opening the list of materials it uses. */
function ChatSources({ sources }: { sources: StoredDocument[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div
      className="relative"
      onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((shown) => !shown)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-edge px-2.5 text-[0.8125rem] text-muted hover:text-fg"
      >
        <FileIcon size={14} strokeWidth={1.9} />
        {count(sources.length, 'source', 'sources')}
      </button>
      {open && (
        <div
          id={id}
          className="absolute top-[calc(100%+6px)] left-0 z-20 w-max max-w-[min(20rem,80vw)] rounded-[10px] bg-fg px-3.5 py-2.5 text-ground shadow-lg"
        >
          <p className="mb-1 text-xs leading-[1.5] font-semibold tracking-[0.06em] uppercase">
            Sources in this chat
          </p>
          {sources.length === 0 ? (
            <p className="text-[0.8125rem]">Its materials have been removed.</p>
          ) : (
            <ul className="list-disc pl-[1.125rem] text-[0.8125rem] leading-[1.65]">
              {sources.map(({ id: key, name }) => (
                <li key={key} className="break-words">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Saves a chat to Saved conversations, or takes it off again. Named apart from
 * features/chat/SaveToggle, the chat page's own toggle.
 */
function ChatSaveButton({ chat }: { chat: Conversation }) {
  const saved = Boolean(chat.saved)
  const [failed, setFailed] = useState(false)
  const toggle = () => {
    setFailed(false)
    setConversationSaved(chat.id, !saved).catch((cause: unknown) => {
      console.error('Could not save the chat', cause)
      setFailed(true)
    })
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${chat.title}`}
      title={failed ? 'That didn’t work. Try again.' : undefined}
      onClick={toggle}
      className={`flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium hover:bg-tint ${
        saved ? 'text-accent' : 'text-muted hover:text-fg'
      }`}
    >
      <Bookmark size={16} filled={saved} />
      {/* The label stays "Save"; aria-pressed and the filled icon carry the state. */}
      Save
    </button>
  )
}

/** A workspace's chats, each with its sources, a save button and a way back in. */
export default function WorkspaceChatList({
  chats,
  documents,
}: {
  chats: Conversation[]
  documents: StoredDocument[]
}) {
  if (chats.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-5 py-6 text-muted">
        No chats yet. Ask a question below to start one.
      </p>
    )
  }
  return (
    <ul
      aria-label="Chats in this workspace"
      className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface"
    >
      {chats.map((chat) => (
        <li
          key={chat.id}
          className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
        >
          <span
            aria-hidden="true"
            className="hidden size-10 flex-none items-center justify-center rounded-[10px] bg-tint text-accent sm:flex"
          >
            <Chats size={18} strokeWidth={1.7} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="max-w-full truncate text-[0.9375rem] leading-[1.5] font-medium">
              {chat.title}
            </span>
            <ChatSources sources={materialsFor(chat, documents)} />
          </div>
          <ChatSaveButton chat={chat} />
          <Link
            to={chatPath(chat)}
            className="flex h-11 flex-none items-center gap-[0.4375rem] text-sm font-semibold text-accent hover:underline"
          >
            Continue
            <span className="sr-only">: {chat.title}</span>
            <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
