import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import ErrorAlert from '../../components/ErrorAlert.tsx'
import { ArrowLeft, ArrowRight, Check } from '../../components/icons.tsx'
import { createWorkspace } from '../../lib/storage/index.ts'
import type { NewDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import { useDocumentUpload } from '../upload/use-document-upload.ts'
import { SECONDARY } from './button-styles.ts'
import MaterialsStep from './MaterialsStep.tsx'
import NameStep from './NameStep.tsx'

const STEPS = ['Name and topic', 'Add materials'] as const

const PRIMARY =
  'inline-flex h-11 items-center gap-[0.5625rem] rounded-[10px] bg-accent px-[1.125rem] text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50'

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
              className={`truncate text-[0.9375rem] leading-[1.5] ${active ? 'font-semibold text-fg' : 'text-muted'}`}
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
  const documentUpload = useDocumentUpload({
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

  const busy = documentUpload.status === 'processing'

  return (
    <div className="flex flex-col gap-8">
      <StepIndicator current={step} />

      <div className="flex flex-col gap-7 rounded-2xl border border-line bg-surface p-6 md:p-8">
        {step === 0 ? (
          <NameStep
            id={id}
            formId={`${id}-step-1`}
            name={name}
            topic={topic}
            nameError={nameError}
            headingRef={heading}
            nameInputRef={nameInput}
            onNameChange={(value) => {
              setName(value)
              if (nameError) setNameError(null)
            }}
            onTopicChange={setTopic}
            onSubmit={next}
          />
        ) : (
          <MaterialsStep
            id={id}
            headingRef={heading}
            upload={documentUpload}
            linking={linking}
            onLinkingChange={setLinking}
            pasting={pasting}
            onPastingChange={setPasting}
            added={pending.map(({ document }) => document)}
            onRemove={(documentId) =>
              setPending((current) =>
                current.filter((item) => item.document.id !== documentId),
              )
            }
          />
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
            <span className="text-[0.8125rem] text-muted">
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
