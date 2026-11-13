import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  LinkIcon,
  Lock,
  Trash,
} from '../../components/icons.tsx'
import { createWorkspace } from '../../lib/storage/index.ts'
import type { NewDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import DocumentCard from '../upload/DocumentCard.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import { useDocumentUpload } from '../upload/use-document-upload.ts'

const STEPS = ['Name and topic', 'Add materials'] as const

const FIELD =
  'h-12 w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg'
const SECONDARY =
  'inline-flex h-11 items-center gap-[9px] rounded-[10px] border border-edge bg-surface px-[18px] text-sm font-medium text-fg hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY =
  'inline-flex h-11 items-center gap-[9px] rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50'

function StepIndicator({ current }: { current: number }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-3">
      {STEPS.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className="flex items-center gap-2.5"
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
              className={`text-[15px] ${active ? 'font-semibold text-fg' : 'text-muted'}`}
            >
              {label}
              {done && <span className="sr-only">, done</span>}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`ml-0.5 h-[1.5px] w-10 ${done ? 'bg-accent' : 'bg-line'}`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
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
  const [pending, setPending] = useState<NewDocument[]>([])
  const [pasting, setPasting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const moved = useRef(false)

  const keep = useCallback((document: NewDocument) => {
    setPending((current) => [
      ...current.filter(({ id }) => id !== document.id),
      document,
    ])
  }, [])
  const { upload, retry, reset, ...uploadState } = useDocumentUpload({
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
      for (const document of pending) await add(document, workspace.id)
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
                className="text-2xl leading-[1.3] font-medium outline-none"
              >
                What’s this workspace about?
              </h2>
              <p className="text-[15px] leading-[1.6] text-muted">
                Give it a name you’ll recognise. The topic shows as a tag so you
                can find it later.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-name`} className="text-[15px] font-medium">
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
                aria-describedby={nameError ? `${id}-name-error` : undefined}
                placeholder="e.g. Memory & learning"
                className={FIELD}
              />
              {nameError && (
                <p id={`${id}-name-error`} className="text-sm text-warn">
                  {nameError}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`${id}-topic`}
                className="text-[15px] font-medium"
              >
                Topic <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id={`${id}-topic`}
                type="text"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. Cognitive psychology"
                className={FIELD}
              />
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
                This workspace will only know what you add here. You can add
                more at any time.
              </p>
            </div>

            <section aria-label="Upload" className="flex flex-col gap-4">
              <UploadZone onFile={upload} disabled={busy} />
              <DocumentCard {...uploadState} onClear={reset} onRetry={retry} />
            </section>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled
                  aria-describedby={`${id}-link-soon`}
                  className={SECONDARY}
                >
                  <LinkIcon size={18} strokeWidth={1.8} />
                  Add a link
                </button>
                <span id={`${id}-link-soon`} className="text-xs text-muted">
                  Links are coming soon.
                </span>
              </div>
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
                  {pending.map((document) => (
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
                            current.filter(({ id }) => id !== document.id),
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

            <p className="flex items-center gap-2 rounded-[10px] bg-tint px-3.5 py-3 text-sm text-accent">
              <Lock size={16} strokeWidth={1.9} />
              Locked to your content. Nothing outside these materials is used.
            </p>
          </div>
        )}

        {saveError && (
          <p role="alert" className="rounded-[10px] bg-warn-soft p-4 text-warn">
            {saveError}
          </p>
        )}

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
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-muted">
              Step {step + 1} of {STEPS.length}
            </span>
            {step === 0 ? (
              <button type="submit" form={`${id}-step-1`} className={PRIMARY}>
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void create()}
                disabled={saving || busy}
                className={PRIMARY}
              >
                {saving ? 'Creating…' : 'Create workspace'}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
