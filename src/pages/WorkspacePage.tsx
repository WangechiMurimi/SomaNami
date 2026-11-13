import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLibraryContext } from '../features/library/library-context.ts'
import { getWorkspace } from '../lib/storage/index.ts'
import type { Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

type Loaded =
  { status: 'loading' } | { status: 'ready'; workspace: Workspace | undefined }

/**
 * One workspace and its materials.
 * TODO(#91): chats, the quick-ask composer and adding materials.
 */
export default function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const { documents } = useLibraryContext()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getWorkspace(workspaceId).then(
      (workspace) => !cancelled && setLoaded({ status: 'ready', workspace }),
      () => !cancelled && setLoaded({ status: 'ready', workspace: undefined }),
    )
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  if (loaded.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Opening your workspace…
      </p>
    )
  }
  const { workspace } = loaded
  if (!workspace) {
    return (
      <div>
        <h1 className={H1}>We can’t find that workspace</h1>
        <p className={LEDE}>
          It may have been removed, or saved on another device.{' '}
          <Link
            to="/workspaces"
            className="font-semibold text-accent underline"
          >
            See your workspaces
          </Link>
        </p>
      </div>
    )
  }

  const materials = documents.filter(
    ({ workspaceId: id }) => id === workspace.id,
  )

  return (
    <div className="flex flex-col gap-8">
      <div>
        {workspace.topic && (
          <p className="text-xs font-medium tracking-[0.06em] text-accent uppercase">
            {workspace.topic}
          </p>
        )}
        <h1 className={`${H1} mt-2 break-words`}>{workspace.name}</h1>
      </div>
      <section aria-labelledby="workspace-materials" className="max-w-3xl">
        <h2 id="workspace-materials" className="text-xl font-medium">
          Materials
        </h2>
        {materials.length === 0 ? (
          <p className="mt-3 text-muted">No materials yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {materials.map((material) => (
              <li
                key={material.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <span className="min-w-0 truncate font-medium">
                  {material.name}
                </span>
                <Link
                  to={`/chat/${material.id}`}
                  className="text-[13px] font-semibold text-accent hover:underline"
                >
                  Ask about this
                  <span className="sr-only">: {material.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
