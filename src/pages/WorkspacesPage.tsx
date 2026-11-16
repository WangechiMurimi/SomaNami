import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { ArrowRight, Plus } from '../components/icons.tsx'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { userWorkspaces } from '../features/workspaces/user-workspaces.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import WorkspaceActionDialog from '../features/workspaces/WorkspaceActionDialog.tsx'
import type { DialogAction } from '../features/workspaces/WorkspaceActionDialog.tsx'
import WorkspaceCard from '../features/workspaces/WorkspaceCard.tsx'
import type { WorkspaceAction } from '../features/workspaces/WorkspaceMenu.tsx'
import { setWorkspacePinned } from '../lib/storage/index.ts'
import type { Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

/** Every workspace as a card, plus a way to start a new one (US-08 AC1). */
export default function WorkspacesPage() {
  const navigate = useNavigate()
  const { workspaces, status } = useWorkspaces()
  const { documents } = useLibraryContext()
  const { conversations } = useRecentConversations()
  const [dialog, setDialog] = useState<{
    action: DialogAction
    workspace: Workspace
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useBreadcrumbs([{ label: 'Workspaces' }])

  const materialsIn = (id: string) =>
    documents.filter(({ workspaceId }) => workspaceId === id).length
  const chatsIn = (id: string) =>
    conversations.filter(({ workspaceId }) => workspaceId === id).length

  const act = (workspace: Workspace, action: WorkspaceAction) => {
    setError(null)
    if (action === 'open') {
      navigate(`/workspaces/${workspace.id}`)
    } else if (action === 'pin') {
      setWorkspacePinned(workspace.id, !workspace.pinned).catch(
        (cause: unknown) => {
          console.error('Could not pin the workspace', cause)
          setError('We couldn’t change the pin. Try again.')
        },
      )
    } else {
      setDialog({ action, workspace })
    }
  }

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className={H1}>Your workspaces</h1>
        <p className={LEDE}>
          Pick up where you left off, or start exploring something new.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-warn-soft p-4 text-warn">
          {error}
        </p>
      )}

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
          {userWorkspaces(workspaces).map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              materials={materialsIn(workspace.id)}
              chats={chatsIn(workspace.id)}
              onAction={(action) => act(workspace, action)}
            />
          ))}
          {/* Spans the row so starting something new reads as its own action. */}
          <li className="col-span-full flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-dashed border-edge p-6 md:p-8">
            <Plus size={24} strokeWidth={1.8} className="text-accent" />
            <h2 className="mt-2 text-[22px] leading-[1.3] font-semibold">
              Start something new
            </h2>
            <p className="text-base leading-[1.6] text-muted">
              Gather the sources for one subject. Its chats answer only from
              what you add.
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

      {dialog && (
        <WorkspaceActionDialog
          action={dialog.action}
          workspace={dialog.workspace}
          chats={chatsIn(dialog.workspace.id)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
