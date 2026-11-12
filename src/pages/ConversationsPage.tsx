import { Link } from 'react-router'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { H1, LEDE } from './page-heading.ts'

const DATE = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Every saved chat on this device, most recent first; readable offline (US-07). */
export default function ConversationsPage() {
  const { conversations, status } = useRecentConversations()
  const { documents } = useLibraryContext()
  const nameOf = (id: string | undefined) =>
    documents.find((document) => document.id === id)?.name

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className={H1}>Saved conversations</h1>
        <p className={LEDE}>
          Every chat is saved on this device, so you can read it again even when
          you’re offline.
        </p>
      </div>
      {status === 'loading' ? (
        <p role="status" className="text-muted">
          Opening your chats…
        </p>
      ) : status === 'error' ? (
        <p role="alert" className="rounded-xl bg-warn-soft p-6 text-warn">
          We couldn’t open your saved chats. Reload the page to try again.
        </p>
      ) : conversations.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-muted">
          No chats yet. Open a material in{' '}
          <Link to="/library" className="font-semibold text-accent underline">
            My library
          </Link>{' '}
          and ask a question to start one.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to={chatPath(conversation)}
                className="flex flex-col gap-1 px-5 py-4 hover:bg-tint/50"
              >
                <span className="font-medium text-fg">
                  {conversation.title}
                </span>
                <span className="text-[13px] text-muted">
                  {nameOf(conversation.materialIds[0]) ?? 'Material not found'}{' '}
                  ·{' '}
                  <time
                    dateTime={new Date(conversation.updatedAt).toISOString()}
                  >
                    {DATE.format(conversation.updatedAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
