import type { StoredDocument } from '../../types/contracts.ts'
import { FileIcon } from '../chat/chat-icons.tsx'
import { KIND_LABEL } from '../library/kind-label.ts'

const BADGE: Record<StoredDocument['kind'], string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  text: 'TXT',
  web: 'WEB',
}

/**
 * A workspace's materials with a tick box each, choosing which ones a
 * question asked here uses.
 */
export default function MaterialChecklist({
  materials,
  excluded,
  onToggle,
  onExcludedChange,
}: {
  materials: StoredDocument[]
  /** Ids the learner unticked. */
  excluded: string[]
  onToggle: (id: string) => void
  onExcludedChange: (excluded: string[]) => void
}) {
  const selected = materials.filter(({ id }) => !excluded.includes(id))
  const allSelected = selected.length === materials.length
  return materials.length === 0 ? (
    <p className="text-[0.8125rem] text-muted">
      Nothing here yet. Add notes, readings or slides for this workspace to
      learn from.
    </p>
  ) : (
    <div
      role="group"
      aria-labelledby="selected-title"
      className="flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="selected-title"
          className="text-xs leading-[1.5] font-semibold tracking-[0.08em] text-muted uppercase"
        >
          In this workspace
        </h3>
        <button
          type="button"
          onClick={() =>
            onExcludedChange(allSelected ? materials.map(({ id }) => id) : [])
          }
          className="h-11 px-1 text-[0.8125rem] font-semibold text-accent hover:underline"
        >
          {allSelected ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
        {materials.map((material) => {
          const inputId = `material-${material.id}`
          return (
            <li key={material.id}>
              <label
                htmlFor={inputId}
                className="flex min-h-14 cursor-pointer items-center gap-2.5 px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-8 flex-none flex-col items-center justify-center gap-px rounded-[7px] bg-tint text-accent"
                >
                  <FileIcon size={14} strokeWidth={1.9} />
                  <span className="text-[0.5rem] font-bold tracking-[0.04em]">
                    {BADGE[material.kind]}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    title={material.name}
                    className="truncate text-sm leading-[1.45] font-semibold"
                  >
                    {material.name}
                  </span>
                  <span className="text-[0.8125rem] leading-[1.5] text-muted">
                    {KIND_LABEL[material.kind]}
                  </span>
                </span>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={!excluded.includes(material.id)}
                  onChange={() => onToggle(material.id)}
                  className="size-[1.125rem] flex-none cursor-pointer accent-accent"
                />
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
