import type { StoredDocument } from '../../types/contracts.ts'

interface LibraryListProps {
  documents: readonly StoredDocument[]
  activeId: string | null
  onSelect: (id: string) => void
}

/** The learner's stored documents; choosing one opens its conversation. */
export default function LibraryList({
  documents,
  activeId,
  onSelect,
}: LibraryListProps) {
  return (
    <ul aria-label="Your documents" className="flex flex-wrap gap-2">
      {documents.map((document) => {
        const active = document.id === activeId
        return (
          <li key={document.id} className="min-w-0">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(document.id)}
              className={`max-w-full truncate rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                active
                  ? 'border-jac bg-jac font-bold text-on-jac'
                  : 'border-line bg-surface hover:border-jac'
              }`}
            >
              {document.name}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
