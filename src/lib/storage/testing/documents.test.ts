import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE } from '../schema.ts'
import { newDoc, storedDoc } from './documents.ts'

describe('document builders', () => {
  it('builds a text document named after its id', () => {
    expect(newDoc('cells')).toEqual({
      id: 'cells',
      name: 'cells.txt',
      size: 1,
      kind: 'text',
      pageCount: null,
      chunks: [],
    })
  })

  it('lets a test override any field', () => {
    expect(newDoc('cells', { kind: 'pdf', name: 'Cells.pdf' })).toMatchObject({
      id: 'cells',
      kind: 'pdf',
      name: 'Cells.pdf',
    })
  })

  it('stores a document in the default workspace', () => {
    expect(storedDoc('a', { updatedAt: 5 })).toEqual({
      id: 'a',
      name: 'a.txt',
      size: 1,
      kind: 'text',
      pageCount: 1,
      chunks: [],
      workspaceId: DEFAULT_WORKSPACE.id,
      createdAt: 1,
      updatedAt: 5,
    })
  })
})
