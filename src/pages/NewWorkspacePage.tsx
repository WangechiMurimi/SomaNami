import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import NewWorkspaceWizard from '../features/workspaces/NewWorkspaceWizard.tsx'
import { H1, LEDE } from './page-heading.ts'

/** Guided creation of a workspace (US-08 AC1). */
export default function NewWorkspacePage() {
  useBreadcrumbs([
    { label: 'Workspaces', to: '/workspaces' },
    { label: 'Create a workspace' },
  ])
  return (
    <div className="flex max-w-[47.5rem] flex-col gap-8">
      <div>
        <h1 className={H1}>Create a workspace</h1>
        <p className={LEDE}>
          Organise your materials in one place. You can change these details
          later.
        </p>
      </div>
      <NewWorkspaceWizard />
    </div>
  )
}
