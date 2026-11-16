const CHIP =
  'flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-sm leading-[1.5] font-medium'

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/**
 * The "Your content → Answer" row above Home's composer. The chips only
 * illustrate the sentence beside them, so they are hidden from assistive
 * technology and the sentence carries the meaning.
 */
export default function GroundingNote() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div aria-hidden="true" className="flex flex-none items-center gap-2.5">
        <span className={`${CHIP} bg-tint text-accent`}>
          <svg {...ICON}>
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
            <path d="M14 2v5h6" />
            <path d="M8 13h8M8 17h5" />
          </svg>
          Your content
        </span>
        <svg
          {...ICON}
          width={22}
          height={22}
          strokeWidth={2}
          className="text-accent"
        >
          <path d="m18 8 4 4-4 4" />
          <path d="M2 12h20" />
          <path d="m6 8-4 4 4 4" />
        </svg>
        <span className={`${CHIP} border border-line bg-surface text-fg`}>
          <svg {...ICON}>
            <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
            <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
          </svg>
          Answer
        </span>
      </div>
      <p className="min-w-0 flex-[1_1_20rem] text-base leading-[1.33] text-muted">
        SomaNami stays grounded in your materials, so you can trace answers back
        to their source.
      </p>
    </div>
  )
}
