import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import ErrorAlert from '../../components/ErrorAlert.tsx'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  LinkIcon,
  Trash,
} from '../../components/icons.tsx'
import { createWorkspace } from '../../lib/storage/index.ts'
import type { NewDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import DocumentCard from '../upload/DocumentCard.tsx'
import AddLinkForm from '../upload/AddLinkForm.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import { useDocumentUpload } from '../upload/use-document-upload.ts'
import { SECONDARY } from './button-styles.ts'

const STEPS = ['Name and topic', 'Add materials'] as const

const LABEL = 'text-base leading-[1.5] font-semibold'
const HINT = 'text-[15px] leading-[1.5] text-muted'
const FIELD =
  'h-12 w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg'
const PRIMARY =
  'inline-flex h-11 items-center gap-[9px] rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50'

function StepIndicator({ current }: { current: number }) {
  return (
    <ol aria-label="Steps" className="flex w-full items-center gap-3">
      {STEPS.map((label, index) => {
        const done = index < current
        const active = index === current
        const last = index === STEPS.length - 1
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            // Every step but the last grows, so its connector fills the row.
            className={`flex min-w-0 items-center gap-2.5 ${last ? 'flex-none' : 'flex-1'}`}
          >
            <span
              className={`flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] text-sm font-semibold ${
                done
                  ? 'border-accent bg-accent text-on-accent'
                  : active
                    ? 'border-accent bg-tint text-accent'
                    : 'border-edge text-muted'
              }`}
            >
              {done ? <Check size={15} strokeWidth={2.6} /> : index + 1}
            </span>
            <span
              className={`truncate text-[15px] leading-[1.5] ${active ? 'font-semibold text-fg' : 'text-muted'}`}
            >
              {label}
              {done && <span className="sr-only">, done</span>}
            </span>
            {!last && (
              <span
                aria-hidden="true"
                className={`mr-1 ml-0.5 h-[1.5px] min-w-6 flex-1 ${done ? 'bg-accent' : 'bg-line'}`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface PendingMaterial {
  document: NewDocument
  file?: File
}

/**
 * Creates a workspace in two steps (US-08 AC1). Materials added in step two
 * are parsed straight away but only saved when the workspace is created, so
 * cancelling leaves nothing behind.
 */
export default function NewWorkspaceWizard() {
  const id = useId()
  const navigate = useNavigate()
  const { add } = useLibraryContext()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  // Each parsed material with its original file, uploaded once created.
  const [pending, setPending] = useState<PendingMaterial[]>([])
  const [pasting, setPasting] = useState(false)
  const [linking, setLinking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const moved = useRef(false)

  const keep = useCallback((document: NewDocument, file?: File) => {
    setPending((current) => [
      ...current.filter((item) => item.document.id !== document.id),
      { document, file },
    ])
  }, [])
  const { upload, uploadLink, retry, reset, ...uploadState } =
    useDocumentUpload({
      onReady: keep,
    })

  // Move focus to the new step's heading so screen readers announce it, but
  // not on first render, where focus belongs to the page.
  useEffect(() => {
    if (moved.current) heading.current?.focus()
  }, [step])

  const next = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setNameError('Give your workspace a name.')
      nameInput.current?.focus()
      return
    }
    moved.current = true
    setStep(1)
  }

  const back = () => {
    moved.current = true
    setStep(0)
  }

  const create = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const workspace = await createWorkspace({ name, topic })
      for (const { document, file } of pending) {
        await add(document, workspace.id, file)
      }
      navigate(`/workspaces/${workspace.id}`)
    } catch (error) {
      console.error('Could not create the workspace', error)
      setSaveError(
        'We couldn’t save your workspace on this device. Free up some space and try again.',
      )
      setSaving(false)
    }
  }

  const busy = uploadState.status === 'processing'

  return (
    <div className="flex flex-col gap-8">
      <StepIndicator current={step} />

      <div className="flex flex-col gap-7 rounded-2xl border border-line bg-surface p-6 md:p-8">
        {step === 0 ? (
          <form
            id={`${id}-step-1`}
            onSubmit={next}
            noValidate
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <h2
                ref={heading}
                tabIndex={-1}
                className="text-[22px] leading-[1.3] font-semibold outline-none"
              >
                Set up your workspace
              </h2>
              <p className="text-base leading-[1.6] text-muted">
                Name your workspace and choose a topic to help keep your
                materials organised.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-name`} className={LABEL}>
                Workspace name
              </label>
              <input
                ref={nameInput}
                id={`${id}-name`}
                type="text"
                value={name}
                required
                onChange={(event) => {
                  setName(event.target.value)
                  if (nameError) setNameError(null)
                }}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={
                  nameError
                    ? `${id}-name-error ${id}-name-hint`
                    : `${id}-name-hint`
                }
                placeholder="e.g. Cognitive psychology"
                className={FIELD}
              />
              {nameError && (
                <p id={`${id}-name-error`} className="text-sm text-warn">
                  {nameError}
                </p>
              )}
              <p id={`${id}-name-hint`} className={HINT}>
                Choose a name that helps you recognise this workspace.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`${id}-topic`}
                className={`${LABEL} flex items-center gap-2`}
              >
                Topic
                <span className="rounded-full bg-tile px-2.5 py-0.5 text-xs leading-[1.5] font-medium text-muted">
                  Optional
                </span>
              </label>
              <input
                id={`${id}-topic`}
                type="text"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                aria-describedby={`${id}-topic-hint`}
                placeholder="e.g. Memory and learning"
                className={FIELD}
              />
              <p id={`${id}-topic-hint`} className={HINT}>
                What you want to explore first. You can start chats on other
                topics later.
              </p>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2
                ref={heading}
                tabIndex={-1}
                className="text-2xl leading-[1.3] font-medium outline-none"
              >
                Add the materials it should learn from
              </h2>
              <p className="text-[15px] leading-[1.6] text-muted">
                Chats here answer only from what you add. You can add more at
                any time.
              </p>
            </div>

            <section aria-label="Upload" className="flex flex-col gap-4">
              <UploadZone onFile={upload} disabled={busy} />
              <DocumentCard {...uploadState} onClear={reset} onRetry={retry} />
            </section>

            <div className="flex flex-wrap gap-3">
              {!linking && (
                <button
                  type="button"
                  onClick={() => setLinking(true)}
                  className={`${SECONDARY} self-start`}
                >
                  <LinkIcon size={18} strokeWidth={1.8} />
                  Add a link
                </button>
              )}
              {!pasting && (
                <button
                  type="button"
                  onClick={() => setPasting(true)}
                  className={`${SECONDARY} self-start`}
                >
                  <Clipboard size={18} strokeWidth={1.8} />
                  Paste text
                </button>
              )}
            </div>
            {linking && (
              <AddLinkForm
                disabled={busy}
                onLink={(url) => {
                  void uploadLink(url)
                  setLinking(false)
                }}
                onCancel={() => setLinking(false)}
              />
            )}
            {pasting && (
              <PasteTextForm
                disabled={busy}
                onFile={(file) => {
                  void upload(file)
                  setPasting(false)
                }}
                onCancel={() => setPasting(false)}
              />
            )}

            {pending.length > 0 && (
              <section aria-labelledby={`${id}-added`}>
                <h3 id={`${id}-added`} className="text-[15px] font-medium">
                  Added so far
                </h3>
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {pending.map(({ document }) => (
                    <li
                      key={document.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {document.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPending((current) =>
                            current.filter(
                              (item) => item.document.id !== document.id,
                            ),
                          )
                        }
                        className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-tint hover:text-warn"
                      >
                        <Trash size={18} strokeWidth={1.8} />
                        <span className="sr-only">Remove {document.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {saveError && <ErrorAlert>{saveError}</ErrorAlert>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {step === 0 ? (
            <Link
              to="/workspaces"
              className="inline-flex h-11 items-center px-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              Cancel
            </Link>
          ) : (
            <button type="button" onClick={back} className={SECONDARY}>
              <ArrowLeft size={14} strokeWidth={2.2} />
              Back
            </button>
          )}
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-muted">
              Step {step + 1} of {STEPS.length}
            </span>
            {step === 0 ? (
              <button type="submit" form={`${id}-step-1`} className={PRIMARY}>
                Continue
                <ArrowRight size={14} strokeWidth={2.2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void create()}
                disabled={saving || busy}
                className={PRIMARY}
              >
                {saving ? 'Creating…' : 'Create workspace'}
                <Check size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
