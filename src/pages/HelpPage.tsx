import { Link } from 'react-router'
import {
  MAX_FILE_BYTES,
  SUPPORTED_LABEL,
} from '../features/upload/constants.ts'
import { H1, H2, LEDE } from './page-heading.ts'

const TOPICS = [
  {
    title: 'Adding materials',
    body: `Upload ${SUPPORTED_LABEL} files up to ${MAX_FILE_BYTES / 1024 / 1024} MB from Home or My library. SomaNami reads them on this device and splits them into passages it can quote back to you.`,
  },
  {
    title: 'Asking questions',
    body: 'Open a material and ask in your own words. Answers come only from your materials and show the passages they used. When your materials don’t cover a question, SomaNami says so instead of guessing.',
  },
  {
    title: 'Following up',
    body: 'Ask follow-up questions in the same chat without repeating yourself. Your chats are saved, so you can pick one up again from Recent chats or Saved conversations.',
  },
  {
    title: 'Working offline',
    body: 'Your materials and saved chats stay on this device and open without a connection. Asking a new question needs a connection; the sidebar shows whether you’re online.',
  },
] as const

/** How SomaNami works, in the words the rest of the app uses. */
export default function HelpPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className={H1}>How SomaNami works</h1>
        <p className={LEDE}>
          SomaNami only learns from what you share, so every answer comes from
          your own materials.
        </p>
      </div>
      <div className="flex flex-col gap-8">
        {TOPICS.map(({ title, body }) => (
          <section key={title} className="flex flex-col gap-2">
            <h2 className={H2}>{title}</h2>
            <p className="text-[15px] leading-[1.6] text-muted">{body}</p>
          </section>
        ))}
      </div>
      <p>
        <Link to="/" className="font-semibold text-accent hover:underline">
          Start on Home
        </Link>
      </p>
    </div>
  )
}
