import type { ReactNode } from 'react'
import { H2 } from '../../pages/page-heading.ts'

/** One headed section of the Privacy Notice or Terms. */
export default function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className={H2}>{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.6] text-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-fg">
        {children}
      </div>
    </section>
  )
}
