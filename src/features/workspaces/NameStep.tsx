import type { FormEvent, RefObject } from 'react'

const LABEL = 'text-base leading-[1.5] font-semibold'
const HINT = 'text-[15px] leading-[1.5] text-muted'
const FIELD =
  'h-12 w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg'

/**
 * Step one of the new-workspace wizard: its name and an optional topic. The
 * wizard owns the values and submits the form from its footer by `formId`.
 */
export default function NameStep({
  id,
  formId,
  name,
  topic,
  nameError,
  headingRef,
  nameInputRef,
  onNameChange,
  onTopicChange,
  onSubmit,
}: {
  /** Prefix for the fields' ids. */
  id: string
  formId: string
  name: string
  topic: string
  nameError: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
  nameInputRef: RefObject<HTMLInputElement | null>
  onNameChange: (name: string) => void
  onTopicChange: (topic: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-[22px] leading-[1.3] font-semibold outline-none"
        >
          Set up your workspace
        </h2>
        <p className="text-base leading-[1.6] text-muted">
          Name your workspace and choose a topic to help keep your materials
          organised.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className={LABEL}>
          Workspace name
        </label>
        <input
          ref={nameInputRef}
          id={`${id}-name`}
          type="text"
          value={name}
          required
          onChange={(event) => onNameChange(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={
            nameError ? `${id}-name-error ${id}-name-hint` : `${id}-name-hint`
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
          onChange={(event) => onTopicChange(event.target.value)}
          aria-describedby={`${id}-topic-hint`}
          placeholder="e.g. Memory and learning"
          className={FIELD}
        />
        <p id={`${id}-topic-hint`} className={HINT}>
          What you want to explore first. You can start chats on other topics
          later.
        </p>
      </div>
    </form>
  )
}
