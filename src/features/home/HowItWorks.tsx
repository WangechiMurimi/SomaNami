import type { ReactNode } from 'react'

// Icon paths from the design canvas; each step's icon is decoration for its title.
const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'Add your materials',
    body: 'Upload your notes, readings or slides.',
    icon: (
      <>
        <path d="M12 13v8" />
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="m8 17 4-4 4 4" />
      </>
    ),
  },
  {
    title: 'Ask questions, explore ideas',
    body: 'Ask follow-up questions, and we’ll work through them together.',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  {
    // PRD capabilities 4 and 5: the learner sets complexity and format.
    title: 'Make it make sense to you',
    body: 'Break down complex ideas, try an analogy, or adjust the level of detail.',
    icon: (
      <>
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6" />
        <path d="M10 22h4" />
      </>
    ),
  },
  {
    title: 'Explore it another way',
    body: 'See how ideas connect through concept maps, comparisons, or visual explanations.',
    icon: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
      </>
    ),
  },
]

/** The four directives beside the Home cube, with copy from the canvas. */
export default function HowItWorks() {
  return (
    <ol aria-label="How it works" className="flex flex-col gap-6 lg:pt-10">
      {STEPS.map(({ title, body, icon }) => (
        <li key={title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="flex size-11 flex-none items-center justify-center rounded-xl bg-tint text-accent"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icon}
            </svg>
          </span>
          <div className="flex flex-col gap-[0.1875rem]">
            <h2 className="text-lg leading-[1.4] font-semibold">{title}</h2>
            <p className="max-w-[31.25rem] text-base leading-[1.6] text-muted">
              {body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
