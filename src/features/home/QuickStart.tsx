import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import Composer from '../../components/Composer.tsx'
import { ArrowRight } from '../../components/icons.tsx'
import { DEFAULT_WORKSPACE } from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import { newChatPath } from '../chat/conversation-materials.ts'
import { useLibraryContext } from '../library/library-context.ts'
import DocumentCard from '../upload/DocumentCard.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import { useWorkspaces } from '../workspaces/use-workspaces.ts'
import { useWorkspaceUpload } from '../workspaces/use-workspace-upload.ts'

const withQuestion = (path: string, question: string) =>
  `${path}${path.includes('?') ? '&' : '?'}q=${encodeURIComponent(question.trim())}`

/**
 * Home's composer. Materials added here go to the default workspace; a
 * question opens New chat in the workspace it should use, asking which one
 * when more than one has materials.
 */
export default function QuickStart({ id }: { id: string }) {
  const fieldId = useId()
  const navigate = useNavigate()
  const { documents } = useLibraryContext()
  const { workspaces } = useWorkspaces()
  const [question, setQuestion] = useState('')
  const [pasting, setPasting] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [added, setAdded] = useState<StoredDocument | null>(null)
  const { upload, retry, reset, ...uploadState } = useWorkspaceUpload(
    DEFAULT_WORKSPACE.id,
    setAdded,
  )

  // Only workspaces with something to read can answer a question.
  const ready = workspaces.filter((workspace) =>
    documents.some(({ workspaceId }) => workspaceId === workspace.id),
  )
  const [picked, setPicked] = useState<string | null>(null)

  const send = () => {
    if (ready.length === 1) {
      navigate(withQuestion(newChatPath(ready[0]!.id), question))
    } else {
      setChoosing(true)
    }
  }

  const choose = (event: FormEvent) => {
    event.preventDefault()
    const workspace = picked ?? ready[0]?.id
    if (workspace) navigate(withQuestion(newChatPath(workspace), question))
  }

  return (
    <section id={id} aria-label="Start a chat" className="scroll-mt-8">
      <div className="flex flex-col gap-4">
        <Composer
          label="Ask a question or share what you’re reading"
          placeholder="Ask a question or share what you’re reading"
          value={question}
          onChange={(value) => {
            setQuestion(value)
            setChoosing(false)
          }}
          onSubmit={send}
          canSend={ready.length > 0 && question.trim().length > 0}
          sendDescription={
            ready.length === 0
              ? 'Add a material first, so there’s something to answer from.'
              : 'Type a question to send.'
          }
          onUpload={(file) => void upload(file)}
          onPaste={() => setPasting(true)}
        />

        <DocumentCard {...uploadState} onClear={reset} onRetry={retry} />
        {uploadState.status === 'ready' &&
          added?.id === uploadState.document.id && (
            <Link
              to={newChatPath(added.workspaceId, added.id)}
              className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              Ask about this
              <ArrowRight size={15} />
            </Link>
          )}

        {pasting && (
          <PasteTextForm
            disabled={uploadState.status === 'processing'}
            onFile={(file) => {
              void upload(file)
              setPasting(false)
            }}
            onCancel={() => setPasting(false)}
          />
        )}

        {choosing && ready.length > 1 && (
          <form
            onSubmit={choose}
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[15px] font-medium">
                Which workspace should this chat use?
              </legend>
              {ready.map((workspace) => (
                <label
                  key={workspace.id}
                  htmlFor={`${fieldId}-${workspace.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-[10px] border border-line px-4 has-[:checked]:border-accent has-[:checked]:bg-tint"
                >
                  <input
                    id={`${fieldId}-${workspace.id}`}
                    type="radio"
                    name={`${fieldId}-workspace`}
                    value={workspace.id}
                    checked={(picked ?? ready[0]?.id) === workspace.id}
                    onChange={() => setPicked(workspace.id)}
                    className="accent-accent"
                  />
                  <span className="font-medium">{workspace.name}</span>
                  {workspace.topic && (
                    <span className="text-[13px] text-muted">
                      {workspace.topic}
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              Continue
              <ArrowRight size={15} />
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
