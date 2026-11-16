import GroundingNote from '../features/home/GroundingNote.tsx'
import HomeCube from '../features/home/HomeCube.tsx'
import HowItWorks from '../features/home/HowItWorks.tsx'
import QuickStart from '../features/home/QuickStart.tsx'
import { H1 } from './page-heading.ts'

/**
 * Landing screen: what SomaNami does, how to use it, and where to start. It
 * fills the viewport below the top bar (whose height plus main's padding is
 * subtracted) so the composer sits at the bottom, as on the canvas.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col gap-14 md:min-h-[calc(100dvh-14rem)]">
      <h1 className={H1}>What would you like to explore today?</h1>

      <div className="grid items-center gap-5 md:grid-cols-2">
        <HomeCube />
        <HowItWorks />
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <GroundingNote />
        <QuickStart />
      </div>
    </div>
  )
}
