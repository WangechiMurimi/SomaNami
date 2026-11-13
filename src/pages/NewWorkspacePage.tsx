import { Link } from 'react-router'
import NewWorkspaceWizard from '../features/workspaces/NewWorkspaceWizard.tsx'
import { H1, LEDE } from './page-heading.ts'

/** Guided creation of a workspace (US-08 AC1). */
export default function NewWorkspacePage() {
  return (
    <div className="flex max-w-[47.5rem] flex-col gap-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-muted">
          <li>
            <Link to="/workspaces" className="hover:text-fg hover:underline">
              Workspaces
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            New workspace
          </li>
        </ol>
      </nav>
      <div>
        <h1 className={H1}>Create a workspace</h1>
        <p className={LEDE}>
          A few short steps. You can change any of this later.
        </p>
      </div>
      <NewWorkspaceWizard />
    </div>
  )
}
