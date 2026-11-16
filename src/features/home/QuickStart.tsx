import { useState } from 'react'
import Composer from '../../components/Composer.tsx'
import { DEFAULT_WORKSPACE } from '../../lib/storage/index.ts'
import { useStartChat } from '../chat/use-start-chat.ts'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import AttachmentChips from './AttachmentChips.tsx'
import { useAttachments } from './use-attachments.ts'

/** Why Send is unavailable, or `undefined` when it isn't. */
function blockedBecause({
  question,
  ready,
  uploading,
}: {
  question: string
  ready: number
  uploading: boolean
}): string | undefined {
  if (uploading) return 'Wait for your files to finish adding.'
  if (ready === 0)
    return 'Attach a file first, so there’s something to answer from.'
  if (question.trim().length === 0) return 'Type a question to send.'
  return undefined
}

/**
 * Home's composer. Files attached here go to the default workspace; sending
 * starts a loose chat over them (it shows under Recents, in no workspace) and
 * opens it, where the question is asked straight away.
 */
export default function QuickStart() {
  const { attachments, attach, retry, remove } = useAttachments()
  const [question, setQuestion] = useState('')
  const [pasting, setPasting] = useState(false)
  const { start: startChat, starting, error } = useStartChat()

  const materialIds = attachments.flatMap((attachment) =>
    attachment.status === 'ready' ? [attachment.document.id] : [],
  )
  // Sending mid-upload would leave the unfinished file out of the chat.
  const uploading = attachments.some(({ status }) => status === 'processing')
  const blocked = blockedBecause({
    question,
    ready: materialIds.length,
    uploading,
  })

  const start = () =>
    startChat({ workspaceId: DEFAULT_WORKSPACE.id, materialIds, question })

  return (
    <section aria-label="Start a chat" className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-[10px] bg-warn-soft p-4 text-warn">
          {error}
        </p>
      )}

      <Composer
        label="Ask a question or share what you’re reading"
        placeholder="Ask a question or share what you’re reading"
        value={question}
        onChange={setQuestion}
        onSubmit={() => void start()}
        canSend={!starting && blocked === undefined}
        sendDescription={blocked}
        onUpload={attach}
        onPaste={() => setPasting(true)}
        attachments={
          <AttachmentChips
            attachments={attachments}
            onRetry={retry}
            onRemove={remove}
          />
        }
      />

      {pasting && (
        <PasteTextForm
          onFile={(file) => {
            attach(file)
            setPasting(false)
          }}
          onCancel={() => setPasting(false)}
        />
      )}
    </section>
  )
}
