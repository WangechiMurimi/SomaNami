import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useAuth } from '../auth/auth-context.ts'
import ChatMessage from './ChatMessage.tsx'
import { useChat } from './use-chat.ts'
import type { UseChatOptions } from './use-chat.ts'

const PENDING_LABEL = 'Reading your documents…'
const OFFLINE_NOTICE = 'You’re offline. Reconnect to ask questions.'

function PendingBubble() {
  return (
    <li className="flex items-center gap-2 text-muted">
      <span
        aria-hidden="true"
        className="size-2 animate-pulse rounded-full bg-accent"
      />
      {PENDING_LABEL}
    </li>
  )
}

/**
 * Conversation panel: the transcript with its sources, the question box, and
 * the in-flight and failure states around a send.
 */
export default function ChatPanel({
  className = '',
  ...chatOptions
}: UseChatOptions & { className?: string }) {
  const { messages, status, error, send, retry } = useChat(chatOptions)
  // A saved session keeps the transcript readable offline (US-07), but the
  // session can't be refreshed, so asking waits for the connection. The
  // server's 401 stays the real check; this only spares a doomed request.
  const isOffline = useAuth().status === 'signed-in-offline'
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const isSending = status === 'sending'
  const canSend = draft.trim().length > 0 && !isSending && !isOffline

  useLayoutEffect(() => {
    // New turns arrive at the bottom; keep them in view without hiding history.
    const node = transcriptRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, isSending])

  useEffect(() => {
    // A failure leaves the question in the transcript, so point at the way out.
    if (status === 'error') inputRef.current?.focus()
  }, [status])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    send(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter keeps the newline for multi-part questions.
    if (event.key === 'Enter' && !event.shiftKey) submit(event)
  }

  return (
    <section
      aria-label="Ask about your documents"
      className={`flex min-h-0 flex-col gap-3 ${className}`}
    >
      <div
        ref={transcriptRef}
        role="log"
        tabIndex={0}
        aria-label="Conversation"
        aria-live="polite"
        aria-busy={isSending}
        className="max-h-[28rem] min-h-40 flex-1 overflow-y-auto rounded-xl border border-line bg-surface/60 p-4 sm:p-5"
      >
        {messages.length === 0 && !isSending ? (
          <p className="text-muted">
            Ask a question about your documents and the answer will appear here,
            with the passages it came from.
          </p>
        ) : (
          <ol className="space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isSending && <PendingBubble />}
          </ol>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-warn"
        >
          {error.message}
          {error.retryable && !isOffline && (
            <button
              type="button"
              onClick={retry}
              className="font-bold underline hover:text-fg"
            >
              Try again
            </button>
          )}
        </p>
      )}

      {isOffline && (
        <p
          id="chat-offline"
          role="status"
          className="rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-warn"
        >
          {OFFLINE_NOTICE}
        </p>
      )}

      <form
        onSubmit={submit}
        className="rounded-xl border border-edge bg-surface p-2 focus-within:border-accent sm:flex sm:items-end sm:gap-2"
      >
        <label htmlFor="chat-question" className="sr-only">
          Ask a question about your documents
        </label>
        <textarea
          id="chat-question"
          ref={inputRef}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isOffline}
          aria-describedby={isOffline ? 'chat-offline' : undefined}
          placeholder="What do you want to learn today?"
          className="w-full flex-1 resize-none bg-transparent px-2 py-1.5 text-fg placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="mt-2 w-full rounded-lg bg-accent px-5 py-2 font-bold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
        >
          {isSending ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        This is a simplified overview to get you started. For accuracy and
        depth, always refer to the original source.
      </p>
    </section>
  )
}
