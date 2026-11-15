import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { H1, LEDE } from '../../pages/page-heading.ts'
import BrandMark from '../../components/BrandMark.tsx'
import { SMALL_LINK, STEP_LABEL } from './auth-ui.ts'

interface AuthLayoutProps {
  title: string
  lede?: ReactNode
  /** Small line above the title, such as "Step 1 of 2". */
  eyebrow?: string
  children: ReactNode
  /** Single wide column for reading pages such as Privacy and Terms. */
  wide?: boolean
}

const FEATURES = [
  {
    title: 'Add your materials',
    body: 'Upload documents, paste text or link to an article.',
    icon: (
      <>
        <path d="M12 13v8" />
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="m8 17 4-4 4 4" />
      </>
    ),
  },
  {
    title: 'Ask, then follow up',
    body: 'Every answer points back to the passage it came from.',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  {
    title: 'Your level, your format',
    body: 'Choose how simple or detailed an explanation is, and switch to another format to see it differently.',
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

/** Logo mark and wordmark, linking home. */
function BrandLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-3 self-start rounded-[10px] text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <BrandMark size={44} />
      <span className="font-brand text-[27px] leading-[1.5] font-bold">
        SomaNami
      </span>
    </Link>
  )
}

/** What SomaNami does, shown beside every sign-in screen. */
function BrandPanel() {
  return (
    <section
      aria-label="About SomaNami"
      className="flex min-w-0 flex-col justify-between gap-12 border-t border-line bg-side px-4 py-12 sm:px-8 lg:flex-[1_1_520px] lg:border-t-0 lg:border-r lg:px-16"
    >
      <BrandLink className="hidden lg:flex" />
      <div className="flex max-w-[520px] flex-col gap-7">
        <div className="flex flex-col gap-3">
          {/* Not a heading: each screen's own title is the page's h1. */}
          <p className="font-display text-[2rem] leading-[1.25] font-normal tracking-[-0.01em] text-fg lg:text-[2.5rem]">
            Learn from your own materials.
          </p>
          <p className="text-base leading-[1.6] text-muted">
            Answers come only from what you add, with the source shown under
            each one.
          </p>
        </div>
        <ul className="flex flex-col gap-5">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex gap-3.5">
              <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-tint text-accent">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {feature.icon}
                </svg>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base leading-[1.5] font-semibold text-fg">
                  {feature.title}
                </span>
                <span className="text-[15px] leading-[1.55] text-muted">
                  {feature.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* A link, not a promise: the product's one claim is where answers come
          from, and the details of data handling live on their own page. */}
      <p className="text-sm leading-[1.5]">
        <Link to="/privacy" className={SMALL_LINK}>
          How your data is handled
        </Link>
      </p>
    </section>
  )
}

/**
 * Frame for screens shown before sign-in: the form beside a brand panel, or
 * one wide reading column. There is no theme toggle here: signed-out
 * visitors get the system theme (or this device's saved choice).
 */
export default function AuthLayout({
  title,
  lede,
  eyebrow,
  children,
  wide = false,
}: AuthLayoutProps) {
  if (wide) {
    return (
      <div className="min-h-screen bg-ground text-fg">
        <header className="flex h-20 items-center px-4 pt-5 md:px-12">
          <BrandLink />
        </header>
        <main className="mx-auto w-full max-w-[46rem] px-4 pt-8 pb-24 md:pt-14">
          <h1 className={H1}>{title}</h1>
          {lede && <p className={LEDE}>{lede}</p>}
          <div className="mt-8">{children}</div>
        </main>
      </div>
    )
  }

  // The form comes first in the DOM so phones and keyboards reach it before
  // the brand copy; on wide screens the row is reversed to put the panel left.
  return (
    <div className="flex min-h-screen flex-col bg-ground text-fg lg:flex-row-reverse">
      <main className="flex min-w-0 flex-col px-4 pt-8 pb-12 sm:px-8 lg:flex-[1_1_480px] lg:items-center lg:justify-center lg:py-12">
        <BrandLink className="mb-10 lg:hidden" />
        <div className="mx-auto w-full max-w-[420px]">
          {eyebrow && <p className={`${STEP_LABEL} mb-2`}>{eyebrow}</p>}
          <h1 className="font-display text-[2rem] leading-[1.25] font-normal tracking-[-0.01em]">
            {title}
          </h1>
          {lede && (
            <p className="mt-2 text-[15px] leading-[1.6] text-muted">{lede}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </main>
      <BrandPanel />
    </div>
  )
}
