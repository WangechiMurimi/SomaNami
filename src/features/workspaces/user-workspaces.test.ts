import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'
import { userWorkspaces } from './user-workspaces.ts'

const workspace = (id: string, pinned?: boolean): Workspace => ({
  id,
  name: id,
  topic: '',
  description: '',
  pinned,
  createdAt: 0,
  updatedAt: 0,
})

describe('userWorkspaces', () => {
  it('leaves out the default workspace', () => {
    expect(
      userWorkspaces([workspace(DEFAULT_WORKSPACE.id), workspace('a')]).map(
        ({ id }) => id,
      ),
    ).toEqual(['a'])
  })

  it('lists pinned workspaces first, keeping the order within each group', () => {
    expect(
      userWorkspaces([
        workspace('a'),
        workspace('b', true),
        workspace('c', false),
        workspace('d', true),
      ]).map(({ id }) => id),
    ).toEqual(['b', 'd', 'a', 'c'])
  })
})
