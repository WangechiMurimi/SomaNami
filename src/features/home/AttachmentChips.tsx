import { Close } from '../chat/chat-icons.tsx'
import KindIcon from '../library/KindIcon.tsx'
import type { Attachment } from './use-attachments.ts'

const CHIP =
  'flex min-h-11 max-w-full items-center gap-2 rounded-xl border py-1 pr-1 pl-3 text-sm leading-[1.4]'
const ICON_BUTTON =
  'flex size-9 flex-none items-center justify-center rounded-lg text-muted hover:bg-tint hover:text-fg'

function RemoveButton({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: (attachment: Attachment) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onRemove(attachment)}
      className={ICON_BUTTON}
    >
      <Close size={16} strokeWidth={2} />
      <span className="sr-only">Remove {attachment.fileName}</span>
    </button>
  )
}

/** A placeholder in the chip's shape while the file is read and saved. */
function GhostChip({ attachment }: { attachment: Attachment }) {
  return (
    <div
      role="status"
      data-testid="attachment-ghost"
      className={`${CHIP} border-line bg-tile pr-3`}
    >
      <span
        aria-hidden="true"
        className="size-[18px] flex-none animate-pulse rounded-[5px] bg-line motion-reduce:animate-none"
      />
      <span className="max-w-[14rem] truncate text-muted">
        <span className="sr-only">Adding </span>
        {attachment.fileName}
      </span>
      <span
        aria-hidden="true"
        className="h-2 w-10 flex-none animate-pulse rounded-full bg-line motion-reduce:animate-none"
      />
    </div>
  )
}

/**
 * Files attached to Home's question, shown inside the question box: a ghost
 * while each one uploads, then the file with its type and a way to remove
 * it. A failure stays on its chip, with a retry when one can help.
 */
export default function AttachmentChips({
  attachments,
  onRetry,
  onRemove,
}: {
  attachments: Attachment[]
  onRetry: (key: string) => void
  onRemove: (attachment: Attachment) => void
}) {
  if (attachments.length === 0) return null
  return (
    <ul
      aria-label="Attached files"
      className="flex flex-wrap gap-2 px-4 pt-3.5"
    >
      {attachments.map((attachment) => (
        <li key={attachment.key} className="min-w-0 max-w-full">
          {attachment.status === 'processing' && (
            <GhostChip attachment={attachment} />
          )}
          {attachment.status === 'ready' && (
            <div className={`${CHIP} border-line bg-surface`}>
              <KindIcon kind={attachment.document.kind} />
              <span className="max-w-[14rem] truncate font-medium">
                {attachment.fileName}
              </span>
              <RemoveButton attachment={attachment} onRemove={onRemove} />
            </div>
          )}
          {attachment.status === 'error' && (
            <div className={`${CHIP} border-warn bg-warn-soft`}>
              <span className="flex min-w-0 flex-col py-1">
                <span className="max-w-[14rem] truncate font-medium">
                  {attachment.fileName}
                </span>
                <span role="alert" className="text-[13px] text-warn">
                  {attachment.error.message}
                </span>
              </span>
              {attachment.error.retryable && (
                <button
                  type="button"
                  onClick={() => onRetry(attachment.key)}
                  aria-label={`Try again with ${attachment.fileName}`}
                  className="h-9 flex-none rounded-lg px-3 text-[13px] font-semibold text-warn hover:bg-warn/10"
                >
                  Try again
                </button>
              )}
              <RemoveButton attachment={attachment} onRemove={onRemove} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
