import type { NewDocument, StoredDocument } from '../../../types/contracts.ts'
import { DEFAULT_WORKSPACE } from '../schema.ts'

/** A small parsed text document, as an upload hands it to storage. */
export function newDoc(
  id: string,
  overrides: Partial<NewDocument> = {},
): NewDocument {
  return {
    id,
    name: `${id}.txt`,
    size: 1,
    kind: 'text',
    pageCount: null,
    chunks: [],
    ...overrides,
  }
}

/** The same document as storage keeps it: in the default workspace. */
export function storedDoc(
  id: string,
  overrides: Partial<StoredDocument> = {},
): StoredDocument {
  return {
    ...newDoc(id),
    pageCount: 1,
    workspaceId: DEFAULT_WORKSPACE.id,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}
