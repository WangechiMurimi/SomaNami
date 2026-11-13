const STEPS = [
  {
    title: 'Talk it through',
    body: 'Ask follow-up questions, and we’ll work through them together.',
  },
  {
    title: 'Find your explanation',
    body: 'Go step by step, try an analogy or ask for a simpler explanation.',
  },
  {
    title: 'See another perspective',
    body: 'Connect ideas with a concept map, a comparison or a clear summary.',
  },
] as const

const NUMBER = 'w-7 flex-none pt-0.5 text-[15px] font-semibold text-accent'
const TITLE = 'text-xl leading-[1.4] font-medium'
const BODY = 'max-w-[31.25rem] text-lg leading-[1.6] text-muted'

const number = (position: number) => String(position).padStart(2, '0')

/** The four numbered steps beside the Home cube, with copy from the canvas. */
export default function HowItWorks({ uploadTo }: { uploadTo: string }) {
  return (
    <ol aria-label="How it works" className="flex flex-col gap-8">
      <li className="flex gap-5">
        <span aria-hidden="true" className={NUMBER}>
          01
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className={TITLE}>Add your materials</h2>
          <p className={BODY}>Upload your notes, readings or slides.</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={uploadTo}
              className="flex items-center gap-[7px] text-[15px] font-semibold text-accent hover:underline"
            >
              Upload materials
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m5 12 7-7 7 7" />
                <path d="M12 19V5" />
              </svg>
            </a>
            <span className="flex items-center gap-1.5 text-[15px] text-muted">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Locked to your content
            </span>
          </div>
        </div>
      </li>
      {STEPS.map(({ title, body }, index) => (
        <li key={title} className="flex gap-5">
          <span aria-hidden="true" className={NUMBER}>
            {number(index + 2)}
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className={TITLE}>{title}</h2>
            <p className={BODY}>{body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
