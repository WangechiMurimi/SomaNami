import { Link } from 'react-router'
import { ArrowRight, FolderPlus, Lock, Plus } from '../components/icons.tsx'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import type { Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const CARD =
  'flex min-h-[230px] flex-col gap-2.5 rounded-xl border border-line bg-surface px-6 pt-6'
const CARD_TITLE = 'mt-2 text-xl leading-[1.3] font-medium'
const ACTION =
  'flex items-center gap-[7px] text-sm font-semibold text-accent hover:underline'

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
        <p className="text-sm leading-[1.5] text-muted">
          {workspace.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line py-4">
        <span className="text-[13px] text-muted">
          {count(materials, 'material', 'materials')} ·{' '}
          {count(chats, 'chat', 'chats')}
        </span>
        <Link to={`/workspaces/${workspace.id}`} className={ACTION}>
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

  const materialsIn = (id: string) =>
    documents.filter(({ workspaceId }) => workspaceId === id).length
  const chatsIn = (id: string) =>
    conversations.filter(({ workspaceId }) => workspaceId === id).length

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className={H1}>Workspaces</h1>
          <p className={LEDE}>
            Each workspace keeps its own materials. Chats inside it only draw on
            what you’ve added there.
          </p>
        </div>
        <Link
          to="/workspaces/new"
          className="inline-flex h-11 items-center gap-[9px] rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          <Plus size={15} strokeWidth={2.4} />
          New workspace
        </Link>
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
          className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(16.25rem,1fr))]"
        >
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              materials={materialsIn(workspace.id)}
              chats={chatsIn(workspace.id)}
            />
          ))}
          <li className="flex min-h-[230px] flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-edge p-6">
            <FolderPlus size={24} strokeWidth={1.8} className="text-accent" />
            <h2 className={CARD_TITLE}>Start a new workspace</h2>
            <p className="text-sm leading-[1.5] text-muted">
              Give it a topic, then add the materials it should learn from.
            </p>
            <Link to="/workspaces/new" className={`${ACTION} mt-auto`}>
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
