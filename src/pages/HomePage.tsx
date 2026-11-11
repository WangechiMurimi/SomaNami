import UploadSection from '../features/upload/UploadSection.tsx'
import { H1, LEDE } from './page-heading.ts'

/** Landing screen: what SomaNami does, and a place to add the first material. */
export default function HomePage() {
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className={H1}>What would you like to explore today?</h1>
        <p className={LEDE}>
          SomaNami only learns from what you share, so every answer comes from
          your own materials.
        </p>
      </div>
      <UploadSection />
    </div>
  )
}
