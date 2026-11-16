import { isLooseWorkspace } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'

/**
 * The workspaces a user made, pinned first and otherwise in the order given.
 * The default workspace only holds loose chats and their materials, so it is
 * never shown as a workspace.
 */
export function userWorkspaces(workspaces: readonly Workspace[]): Workspace[] {
  const own = workspaces.filter(({ id }) => !isLooseWorkspace(id))
  return [
    ...own.filter(({ pinned }) => pinned),
    ...own.filter(({ pinned }) => !pinned),
  ]
}
