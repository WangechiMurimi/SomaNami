import type { DocumentKind } from '../../types/contracts.ts'
import { formatSize } from './format-size.ts'
import type { UploadState } from './use-document-upload.ts'

const BADGE = {
  processing: { text: 'Reading your document…', style: 'bg-jac-soft text-jac' },
  ready: { text: '✓ Ready to explore', style: 'bg-mint-soft text-mint' },
  // Rejected before parsing: the file itself is the problem.
  invalid: { text: 'Can’t use this file', style: 'bg-rose-soft text-rose' },
  // Accepted, but reading it failed.
  error: { text: 'Couldn’t process', style: 'bg-rose-soft text-rose' },
}

const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  text: 'Text',
}

const ACTION_STYLE = 'ml-3 text-sm text-muted underline hover:text-ink'

function describe(state: UploadState): string | null {
  if (state.status !== 'ready') return null
  const { document } = state
  const kind = KIND_LABEL[document.kind]
  const pages = document.pageCount ? ` · ${document.pageCount} pages` : ''
  const passages = document.chunks.length
  return `${kind}${pages} · ${formatSize(document.size)} · ${passages} ${passages === 1 ? 'passage' : 'passages'} indexed`
}

type DocumentCardProps = UploadState & {
  onClear: () => void
  onRetry: () => void
}

/** Shows the outcome of the latest upload; announces changes to screen readers. */
export default function DocumentCard(props: DocumentCardProps) {
  const { onClear, onRetry, ...state } = props
  if (state.status === 'idle') return null
  const { status, error } = state
  const isInvalid = error?.stage === 'validation'
  const badge = BADGE[isInvalid ? 'invalid' : status]
  const name =
    state.document?.name ?? ('fileName' in state ? state.fileName : '')
  const summary = describe(state)

  return (
    <div
      role={status === 'error' ? 'alert' : 'status'}
      className="mt-4 grid grid-cols-[96px_1fr] items-center gap-4"
    >
      <div
        aria-hidden="true"
        className="grid aspect-[16/10] place-items-center rounded-lg bg-jac-soft"
      >
        <svg width="40" height="48" viewBox="0 0 40 48">
          <path
            d="M4 2h22l10 10v32a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
            fill="var(--surface)"
            stroke="var(--gold)"
            strokeWidth="2"
          />
          <path
            d="M26 2v10h10"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2"
          />
          <path
            d="M9 22h20M9 28h20M9 34h13"
            stroke="var(--line)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="min-w-0">
        <b className="break-words">{name}</b>
        {summary && <small className="block text-muted">{summary}</small>}
        {error && <p className="mt-1 text-sm text-rose">{error.message}</p>}
        <span
          className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.style}`}
        >
          {badge.text}
        </span>
        {error?.retryable && (
          <button type="button" onClick={onRetry} className={ACTION_STYLE}>
            Try again
          </button>
        )}
        {status !== 'processing' && (
          <button type="button" onClick={onClear} className={ACTION_STYLE}>
            {/* Clears this status only; the document stays in the library. */}
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
