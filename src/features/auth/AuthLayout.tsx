import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ThemeToggle from '../../components/ThemeToggle.tsx'
import { H1, LEDE } from '../../pages/page-heading.ts'

interface AuthLayoutProps {
  title: string
  lede?: ReactNode
  children: ReactNode
  /** Wider column for reading pages such as Privacy and Terms. */
  wide?: boolean
}

/** Frame for screens shown before sign-in: wordmark, theme toggle, one column. */
export default function AuthLayout({
  title,
  lede,
  children,
  wide = false,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-ground text-fg">
      <header className="flex h-20 items-center justify-between px-4 pt-5 md:px-12">
        <Link
          to="/"
          className="font-brand text-2xl leading-[1.5] font-bold text-fg"
        >
          SomaNami
        </Link>
        <ThemeToggle />
      </header>
      <main
        className={`mx-auto w-full px-4 pt-8 pb-24 md:pt-14 ${
          wide ? 'max-w-[46rem]' : 'max-w-[32rem]'
        }`}
      >
        <h1 className={H1}>{title}</h1>
        {lede && <p className={LEDE}>{lede}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  )
}
