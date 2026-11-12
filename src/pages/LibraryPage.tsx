import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { ArrowRight, Lock, Trash } from '../components/icons.tsx'
import { newChatPath } from '../features/chat/conversation-materials.ts'
import { KIND_LABEL } from '../features/library/kind-label.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import UploadSection from '../features/upload/UploadSection.tsx'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import { DEFAULT_WORKSPACE, listConversations } from '../lib/storage/index.ts'
import type { DocumentKind, StoredDocument } from '../types/contracts.ts'
import { H1, H2, LEDE } from './page-heading.ts'

const HEADER =
  'px-5 py-3 text-left text-xs font-medium tracking-[0.06em] text-muted uppercase'

const FILTERS: { label: string; kind: DocumentKind | null }[] = [
  { label: 'All', kind: null },
  { label: 'PDF', kind: 'pdf' },
  { label: 'Word', kind: 'docx' },
  { label: 'Text', kind: 'text' },
]

const chats = (n: number) => `${n} ${n === 1 ? 'chat' : 'chats'}`

/** What removing a material does to the chats that use it (US-08 AC5). */
function RemoveMaterial({
  material,
  onDone,
}: {
  material: StoredDocument
  onDone: () => void
}) {
  const { remove } = useLibraryContext()
  const [effect, setEffect] = useState<{ ending: number; keeping: number }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listConversations(material.id).then(
      (using) => {
        if (cancelled) return
        const ending = using.filter(({ materialIds }) =>
          materialIds.every((id) => id === material.id),
        ).length
        setEffect({ ending, keeping: using.length - ending })
      },
      () => !cancelled && setEffect({ ending: 0, keeping: 0 }),
    )
    return () => {
      cancelled = true
    }
  }, [material.id])

  const confirm = async () => {
    setBusy(true)
    try {
      await remove(material.id)
      onDone()
    } catch (cause) {
      console.error('Could not remove the material', cause)
      setError('We couldn’t remove it. Try again.')
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={`Remove ${material.name}?`}
      confirmLabel="Remove"
      busy={busy || !effect}
      onConfirm={() => void confirm()}
      onCancel={onDone}
    >
      <p>It will be removed from this device.</p>
      {effect && effect.ending > 0 && (
        <p className="mt-2">
          {chats(effect.ending)} that only used this material will be removed
          too.
        </p>
      )}
      {effect && effect.keeping > 0 && (
        <p className="mt-2">
          {chats(effect.keeping)} that also{' '}
          {effect.keeping === 1 ? 'uses' : 'use'} other materials will keep
          those, and earlier answers that quoted this one will no longer show
          the passage.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-warn">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}

/** Every stored material, filterable by type, with upload and removal. */
export default function LibraryPage() {
  const id = useId()
  const { documents, status } = useLibraryContext()
  const { workspaces } = useWorkspaces()
  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [target, setTarget] = useState<string>(DEFAULT_WORKSPACE.id)
  const [removing, setRemoving] = useState<StoredDocument | null>(null)

  const shown = kind
    ? documents.filter((document) => document.kind === kind)
    : documents
  const workspaceName = (workspaceId: string) =>
    workspaces.find(({ id }) => id === workspaceId)?.name ??
    (workspaceId === DEFAULT_WORKSPACE.id ? DEFAULT_WORKSPACE.name : '—')
  // The default workspace is offered even before its first material exists.
  const targets = workspaces.some(({ id }) => id === DEFAULT_WORKSPACE.id)
    ? workspaces
    : [DEFAULT_WORKSPACE, ...workspaces]

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className={H1}>My library</h1>
          <p className={LEDE}>
            Everything you’ve added lives here. SomaNami only answers from these
            materials.
          </p>
        </div>
        <a
          href="#library-upload"
          className="inline-flex h-11 items-center gap-[9px] rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          Upload materials
        </a>
      </div>

      <div id="library-upload" className="flex scroll-mt-8 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={`${id}-target`} className="text-[15px] font-medium">
            Add to workspace
          </label>
          <select
            id={`${id}-target`}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-11 rounded-[10px] border border-edge bg-surface px-3 text-[15px] text-fg"
          >
            {targets.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>
        <UploadSection key={target} workspaceId={target} />
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Lock size={14} strokeWidth={1.9} />
          Locked to your content
        </p>
      </div>

      <section
        aria-labelledby="materials-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="materials-heading" className={H2}>
          Materials
        </h2>
        {status === 'loading' ? (
          <p role="status" className="text-muted">
            Opening your library…
          </p>
        ) : documents.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-muted">
            Nothing here yet. Upload a document above to start.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter by type"
                className="flex flex-wrap gap-2"
              >
                {FILTERS.map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    aria-pressed={kind === filter.kind}
                    onClick={() => setKind(filter.kind)}
                    className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium ${
                      kind === filter.kind
                        ? 'border-accent bg-tint text-accent'
                        : 'border-edge text-muted hover:text-fg'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <span aria-live="polite" className="text-[13px] text-muted">
                Showing {shown.length} of {documents.length}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <caption className="sr-only">Your materials</caption>
                <thead>
                  <tr>
                    <th scope="col" className={HEADER}>
                      Name
                    </th>
                    <th scope="col" className={HEADER}>
                      Type
                    </th>
                    <th scope="col" className={HEADER}>
                      Workspace
                    </th>
                    <th scope="col" className={HEADER}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((document) => (
                    <tr key={document.id} className="border-t border-line">
                      <td className="max-w-[20rem] truncate px-5 py-3.5 font-medium">
                        {document.name}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {KIND_LABEL[document.kind]}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        <Link
                          to={`/workspaces/${document.workspaceId}`}
                          className="hover:text-fg hover:underline"
                        >
                          {workspaceName(document.workspaceId)}
                        </Link>
                      </td>
                      <td className="px-5 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={newChatPath(document.workspaceId, document.id)}
                            className="flex items-center gap-[7px] text-[13px] font-semibold text-accent hover:underline"
                          >
                            Ask about this
                            <span className="sr-only">: {document.name}</span>
                            <ArrowRight size={14} strokeWidth={2.2} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setRemoving(document)}
                            className="inline-flex size-11 items-center justify-center rounded-[10px] text-muted hover:bg-warn-soft hover:text-warn"
                          >
                            <Trash size={17} strokeWidth={1.8} />
                            <span className="sr-only">
                              Remove {document.name}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {removing && (
        <RemoveMaterial material={removing} onDone={() => setRemoving(null)} />
      )}
    </div>
  )
}
