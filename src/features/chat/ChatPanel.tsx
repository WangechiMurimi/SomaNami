import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Composer from '../../components/Composer.tsx'
import { useAuth } from '../auth/auth-context.ts'
import ChatMessage from './ChatMessage.tsx'
import { useChat } from './use-chat.ts'
import type { UseChatOptions } from './use-chat.ts'

const OFFLINE_NOTICE = 'You’re offline. Reconnect to ask questions.'

function PendingBubble() {
  return (
    <li role="status" className="flex items-center gap-2.5 text-sm text-muted">
      <span
        aria-hidden="true"
        className="size-2 flex-none animate-pulse rounded-full bg-accent motion-reduce:animate-none"
      />
      Reading your materials…
    </li>
  )
}

/**
 * Conversation panel: the transcript with its sources, the question box, and
 * the in-flight and failure states around a send.
 */
export default function ChatPanel({
  className = '',
  initialQuestion,
  addMaterialTo,
  ...chatOptions
}: UseChatOptions & {
  className?: string
  initialQuestion?: string
  /** Where to add material when a question goes unanswered. */
  addMaterialTo?: string
}) {
  const { messages, status, error, send, retry } = useChat(chatOptions)
  // A saved session keeps the transcript readable offline (US-07), but the
  // session can't be refreshed, so asking waits for the connection. The
  // server's 401 stays the real check; this only spares a doomed request.
  const isOffline = useAuth().status === 'signed-in-offline'
  const askedInitial = useRef(false)

  useEffect(() => {
    // A chat started from New chat arrives with its first question; ask it
    // once, even when React runs effects twice in development. Offline, it
    // waits for the connection instead of failing.
    if (!initialQuestion || askedInitial.current || isOffline) return
    askedInitial.current = true
    send(initialQuestion)
  }, [initialQuestion, send, isOffline])
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const isSending = status === 'sending'
  const canSend = draft.trim().length > 0 && !isSending && !isOffline

  useLayoutEffect(() => {
    // New turns arrive at the bottom; bring them into view as they land.
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages, isSending])

  useEffect(() => {
    // A failure leaves the question in the transcript, so point at the way out.
    if (status === 'error') inputRef.current?.focus()
  }, [status])

  const submit = () => {
    if (!canSend) return
    send(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <section aria-label="Conversation" aria-busy={isSending}>
        {messages.length === 0 && !isSending ? (
          <p className="text-muted">
            Ask a question and the answer will appear here, with the passages it
            came from.
          </p>
        ) : (
          <ol aria-live="polite" className="flex flex-col gap-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                addMaterialTo={addMaterialTo}
              />
            ))}
            {isSending && <PendingBubble />}
          </ol>
        )}
        <div ref={endRef} />
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl border border-warn bg-warn-soft px-4 py-3"
        >
          <span className="text-sm leading-[1.5]">{error.message}</span>
          {error.retryable && !isOffline && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-11 items-center rounded-[10px] border border-warn px-4 text-sm font-semibold text-warn hover:bg-warn/10"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {isOffline && (
        <p
          role="status"
          className="rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-warn"
        >
          {OFFLINE_NOTICE}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <Composer
          label="Ask a follow-up about your materials"
          placeholder="Ask a follow-up about your materials"
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          canSend={canSend}
          sendDescription={isOffline ? OFFLINE_NOTICE : undefined}
          inputRef={inputRef}
        />
        <p className="text-center text-[13px] leading-[1.5] text-muted">
          This is a simplified overview to get you started. For accuracy and
          depth, always refer to the original source.
        </p>
      </div>
    </div>
  )
}
