import { Link, useParams } from 'react-router'
import DocumentChat from '../features/chat/DocumentChat.tsx'
import { useLibraryContext } from '../features/library/library-context.ts'
import { H1, LEDE } from './page-heading.ts'

/** A chat about one stored document, addressed by its id in the URL. */
export default function ChatPage() {
  const { documentId } = useParams()
  const { documents, status } = useLibraryContext()
  const document = documents.find(({ id }) => id === documentId)

  if (!document) {
    if (status === 'loading') {
      return (
        <p role="status" className="text-muted">
          Opening your library…
        </p>
      )
    }
    return (
      <div>
        <h1 className={H1}>We can’t find that material</h1>
        <p className={LEDE}>
          It may have been removed, or saved on another device.{' '}
          <Link to="/library" className="font-semibold text-accent underline">
            Go to your library
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[54rem] flex-col gap-7">
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-[13px] text-accent">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Locked to your content
        </p>
        <h1 className={`${H1} mt-4 break-words`}>{document.name}</h1>
        <p className={LEDE}>
          This chat only sees this material. It won’t look anywhere else.
        </p>
      </div>
      {/* Keyed so switching materials starts from that material's history. */}
      <DocumentChat key={document.id} document={document} />
    </div>
  )
}
