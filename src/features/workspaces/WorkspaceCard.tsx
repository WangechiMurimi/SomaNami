import { Link } from 'react-router'
import { ArrowRight } from '../../components/icons.tsx'
import type { Workspace } from '../../types/contracts.ts'
import { Pin } from './workspace-icons.tsx'
import WorkspaceMenu from './WorkspaceMenu.tsx'
import type { WorkspaceAction } from './WorkspaceMenu.tsx'

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * A workspace in the list. The whole card opens it (the title link stretches
 * over the card); the actions menu sits above that link, shown on hover or
 * keyboard focus, and always on touch screens where there is no hover.
 */
export default function WorkspaceCard({
  workspace,
  materials,
  chats,
  onAction,
}: {
  workspace: Workspace
  materials: number
  chats: number
  onAction: (action: WorkspaceAction) => void
}) {
  return (
    <li className="group relative flex min-h-[270px] flex-col gap-2.5 rounded-2xl border border-line bg-surface px-6 pt-6 transition-colors hover:border-edge md:px-8 md:pt-8">
      <div className="flex min-h-6 items-center gap-2 pr-10">
        {workspace.pinned && (
          <span className="flex items-center gap-1 text-[13px] font-medium text-accent">
            <Pin size={14} />
            Pinned
          </span>
        )}
        {workspace.topic && (
          <span className="min-w-0 truncate rounded-md bg-tag px-3 py-[5px] text-xs leading-[1.5] font-medium tracking-[0.06em] text-accent uppercase">
            {workspace.topic}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-[22px] leading-[1.3] font-semibold break-words">
        <Link
          to={`/workspaces/${workspace.id}`}
          // The ring goes on the stretched layer so focus outlines the card.
          className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        >
          {workspace.name}
        </Link>
      </h2>
      {workspace.description && (
        <p className="text-base leading-[1.6] text-muted">
          {workspace.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-5 pb-6">
        <span className="text-sm leading-[1.5] text-muted">
          {count(materials, 'material', 'materials')} ·{' '}
          {count(chats, 'chat', 'chats')}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent group-hover:underline"
        >
          Open
          <ArrowRight size={14} strokeWidth={2.2} />
        </span>
      </div>
      <WorkspaceMenu
        name={workspace.name}
        pinned={Boolean(workspace.pinned)}
        onSelect={onAction}
        className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </li>
  )
}
