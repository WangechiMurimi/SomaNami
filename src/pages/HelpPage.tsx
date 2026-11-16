import { Link } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import {
  MAX_FILE_BYTES,
  SUPPORTED_LABEL,
} from '../features/upload/constants.ts'
import { H1, H2, LEDE } from './page-heading.ts'

// The lede carries the one grounding statement; the topics just explain how.
const TOPICS = [
  {
    title: 'Adding materials',
    body: `Upload ${SUPPORTED_LABEL} files up to ${MAX_FILE_BYTES / 1024 / 1024} MB, or paste text, from Home, a workspace or My library. In a workspace you can also add a web page by its link. SomaNami splits each one into passages it can quote back to you.`,
  },
  {
    title: 'Asking and following up',
    body: 'Ask in your own words, then follow up in the same chat without repeating yourself.',
  },
  {
    title: 'Checking the source',
    body: 'Each answer lists the passages it used. Open one to see exactly what your material says.',
  },
  {
    title: 'Workspaces',
    body: 'Keep the materials and chats for one topic together. A workspace chat uses the materials you choose for it.',
  },
  {
    title: 'Recents',
    body: 'Chats you start from Home don’t belong to a workspace. You’ll find them under Recents in the sidebar.',
  },
  {
    title: 'Saving chats',
    body: 'Save a chat from Recents or from a workspace to keep it in Saved conversations.',
  },
] as const

const LABEL =
  'inline-flex rounded-md px-2.5 py-1 text-xs font-medium tracking-[0.06em] uppercase'

const LABELS = [
  {
    name: 'From your materials',
    style: 'bg-success-soft text-success',
    meaning:
      'Supported by the passages shown under the answer. Open one to read it in context.',
  },
  {
    name: 'Not answered from your materials',
    style: 'bg-warn-soft text-warn',
    meaning:
      'Your materials don’t cover the question, so SomaNami says so instead of guessing. Try rephrasing, or add a material that covers it.',
  },
] as const

/** How SomaNami works, in the words the rest of the app uses. */
export default function HelpPage() {
  useBreadcrumbs([{ label: 'Help' }])

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className={H1}>How SomaNami works</h1>
        <p className={LEDE}>
          SomaNami answers from the materials you add, and shows where each
          answer came from.
        </p>
      </div>

      <ol className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {TOPICS.map(({ title, body }, index) => (
          <li
            key={title}
            className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-7"
          >
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-xl bg-tint text-base font-semibold text-accent"
            >
              {index + 1}
            </span>
            <h2 className="mt-1 text-xl leading-[1.3] font-medium">{title}</h2>
            <p className="text-[15px] leading-[1.6] text-muted">{body}</p>
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="help-labels"
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-7 md:p-8"
      >
        <h2 id="help-labels" className={H2}>
          What the labels on an answer mean
        </h2>
        <dl className="grid gap-6 md:grid-cols-2">
          {LABELS.map(({ name, style, meaning }) => (
            <div key={name} className="flex flex-col gap-2">
              <dt>
                <span className={`${LABEL} ${style}`}>{name}</span>
              </dt>
              <dd className="text-[15px] leading-[1.6] text-muted">
                {meaning}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-[15px]">
        <Link
          to="/your-data"
          className="font-semibold text-accent hover:underline"
        >
          How your data is handled
        </Link>
      </p>
    </div>
  )
}
