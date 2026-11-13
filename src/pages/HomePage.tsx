import HomeCube from '../features/home/HomeCube.tsx'
import HowItWorks from '../features/home/HowItWorks.tsx'
import UploadSection from '../features/upload/UploadSection.tsx'
import { H1 } from './page-heading.ts'

/** Landing screen: what SomaNami does, how to use it, and where to start. */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-2">
        <h1 className={H1}>What would you like to explore today?</h1>
        <p className="max-w-[52rem] text-lg leading-[1.33] text-muted">
          SomaNami only learns from what you share, so every answer comes from
          your own materials.
        </p>
      </div>

      <div className="grid items-center gap-5 md:grid-cols-2">
        <HomeCube />
        <HowItWorks uploadTo="#upload" />
      </div>

      {/* TODO(#104): replaced by the quick-start composer. */}
      <div id="upload" className="max-w-3xl scroll-mt-8">
        <UploadSection />
      </div>
    </div>
  )
}
