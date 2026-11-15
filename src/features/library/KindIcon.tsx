import type { DocumentKind } from '../../types/contracts.ts'

// A PDF is usually a reading or exported slides, so it gets the open-book
// glyph; Word and plain text are the learner's own writing, so a page glyph.
const PATHS: Record<DocumentKind, string[]> = {
  pdf: [
    'M12 7v14',
    'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  ],
  docx: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
    'M14 2v5h6',
    'M8 13h8M8 17h5',
  ],
  text: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
    'M14 2v5h6',
    'M8 13h3M8 17h8',
  ],
}

/** Decorative glyph for a material's type; the type is always named in text too. */
export default function KindIcon({
  kind,
  size = 18,
}: {
  kind: DocumentKind
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-accent"
    >
      {PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
