import { Link } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { ArrowRight, Lock, Plus } from '../components/icons.tsx'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import type { Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const CARD =
  'flex min-h-[270px] flex-col gap-2.5 rounded-2xl border border-line bg-surface px-6 pt-6 md:px-8 md:pt-8'
const CARD_TITLE = 'mt-2 text-[22px] leading-[1.3] font-semibold'
const CARD_BODY = 'text-base leading-[1.6] text-muted'

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

function WorkspaceCard({
  workspace,
  materials,
  chats,
}: {
  workspace: Workspace
  materials: number
  chats: number
}) {
  return (
    <li className={CARD}>
      {workspace.topic && (
        <span className="self-start rounded-md bg-tag px-3 py-[5px] text-xs leading-[1.5] font-medium tracking-[0.06em] text-accent uppercase">
          {workspace.topic}
        </span>
      )}
      <h2 className={CARD_TITLE}>{workspace.name}</h2>
      {workspace.description && (
        <p className={CARD_BODY}>{workspace.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-5 pb-6">
        <span className="text-sm leading-[1.5] text-muted">
          {count(materials, 'material', 'materials')} ·{' '}
          {count(chats, 'chat', 'chats')}
        </span>
        <Link
          to={`/workspaces/${workspace.id}`}
          className="inline-flex h-11 flex-none items-center gap-2 rounded-[10px] border border-edge bg-surface px-4 text-sm font-medium text-fg hover:bg-tint"
        >
          Open <span className="sr-only">{workspace.name}</span>
          <ArrowRight size={14} strokeWidth={2.2} />
        </Link>
      </div>
    </li>
  )
}

/** Every workspace as a card, plus a way to start a new one (US-08 AC1). */
export default function WorkspacesPage() {
  const { workspaces, status } = useWorkspaces()
  const { documents } = useLibraryContext()
  const { conversations } = useRecentConversations()
  useBreadcrumbs([{ label: 'Workspaces' }])

  const materialsIn = (id: string) =>
    documents.filter(({ workspaceId }) => workspaceId === id).length
  const chatsIn = (id: string) =>
    conversations.filter(({ workspaceId }) => workspaceId === id).length

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className={H1}>Your workspaces</h1>
        <p className={LEDE}>
          Pick up where you left off, or start exploring something new.
        </p>
      </div>

      {status === 'loading' ? (
        <p role="status" className="text-muted">
          Opening your workspaces…
        </p>
      ) : status === 'error' ? (
        <p role="alert" className="rounded-xl bg-warn-soft p-6 text-warn">
          We couldn’t open your workspaces. Reload the page to try again.
        </p>
      ) : (
        <ul
          aria-label="Your workspaces"
          className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(16.25rem,1fr))]"
        >
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              materials={materialsIn(workspace.id)}
              chats={chatsIn(workspace.id)}
            />
          ))}
          {/* Spans the row so starting something new reads as its own action. */}
          <li className="col-span-full flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-dashed border-edge p-6 md:p-8">
            <Plus size={24} strokeWidth={1.8} className="text-accent" />
            <h2 className={CARD_TITLE}>Start something new</h2>
            <p className={CARD_BODY}>
              Create a space for your materials, questions and ideas.
            </p>
            <Link
              to="/workspaces/new"
              className="mt-1.5 inline-flex min-h-11 items-center gap-[7px] self-start text-sm font-semibold text-accent hover:underline"
            >
              Create workspace
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </li>
        </ul>
      )}

      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Lock size={14} strokeWidth={1.9} />
        Each workspace is locked to its own materials. Nothing is shared between
        them.
      </p>
    </div>
  )
}
