import { MissingParentError } from '../cloud.ts'
import type {
  ChunkRow,
  CloudStore,
  CloudTable,
  Cursor,
  DeletionRow,
  MaterialRow,
  PulledDeletion,
  PulledRow,
  Row,
} from '../cloud.ts'

const copy = <T>(value: T): T => structuredClone(value)

const after = (cursor: Cursor) => (row: { at: number; id: string }) =>
  row.at > cursor.at || (row.at === cursor.at && row.id > cursor.id)

const PARENT: Partial<Record<CloudTable, [string, CloudTable]>> = {
  documents: ['workspace_id', 'workspaces'],
  conversations: ['workspace_id', 'workspaces'],
  messages: ['conversation_id', 'conversations'],
}

/**
 * One learner's cloud in memory, enforcing the same rules as the migrations:
 * a stale update or a deleted record is skipped, a missing parent fails the
 * statement, deletes cascade, and every write gets a server time. Lets tests
 * sync several devices without a network.
 */
export function createMemoryCloud({ userId = 'user-a' } = {}) {
  let clock = 1000
  const tick = () => ++clock
  const tables = new Map<CloudTable, Map<string, PulledRow>>([
    ['workspaces', new Map()],
    ['documents', new Map()],
    ['conversations', new Map()],
    ['messages', new Map()],
  ])
  const chunks = new Map<string, ChunkRow>()
  const materials = new Map<string, MaterialRow>()
  const deletions = new Map<string, PulledDeletion>()
  const objects = new Set<string>()
  const failures = new Map<keyof CloudStore, Error>()

  const table = (name: CloudTable) => tables.get(name)!
  const failIfAsked = (method: keyof CloudStore) => {
    const error = failures.get(method)
    if (error) {
      failures.delete(method)
      throw error
    }
  }

  function removeCascade(name: CloudTable, id: string) {
    if (!table(name).delete(id)) return
    if (name === 'workspaces') {
      for (const row of [...table('documents').values()])
        if (row.workspace_id === id) removeCascade('documents', row.id)
      for (const row of [...table('conversations').values()])
        if (row.workspace_id === id) removeCascade('conversations', row.id)
    } else if (name === 'documents') {
      for (const chunk of [...chunks.values()])
        if (chunk.document_id === id) chunks.delete(chunk.id)
      for (const [key, m] of [...materials])
        if (m.document_id === id) materials.delete(key)
    } else if (name === 'conversations') {
      for (const row of [...table('messages').values()])
        if (row.conversation_id === id) table('messages').delete(row.id)
      for (const [key, m] of [...materials])
        if (m.conversation_id === id) materials.delete(key)
    }
  }

  const cloud: CloudStore = {
    async upsert(name, rows) {
      failIfAsked('upsert')
      const parent = PARENT[name]
      // The whole statement fails, as a foreign key violation would.
      if (
        parent &&
        rows.some((row) => !table(parent[1]).has(String(row[parent[0]])))
      ) {
        throw new MissingParentError()
      }
      const written: string[] = []
      for (const row of rows) {
        const deletion = deletions.get(`${name}:${row.id}`)
        if (deletion && deletion.deleted_at >= Number(row.created_at)) continue
        const existing = table(name).get(row.id)
        if (
          existing &&
          'updated_at' in row &&
          Number(row.updated_at) < Number(existing.updated_at)
        ) {
          continue
        }
        table(name).set(row.id, { ...copy(row), server_updated_at: tick() })
        written.push(row.id)
      }
      return written
    },

    async insertChunks(rows) {
      failIfAsked('insertChunks')
      if (rows.some((row) => !table('documents').has(row.document_id))) {
        throw new MissingParentError()
      }
      for (const row of rows)
        if (!chunks.has(row.id)) chunks.set(row.id, copy(row))
    },

    async setConversationMaterials(conversationId, documentIds) {
      failIfAsked('setConversationMaterials')
      if (!table('conversations').has(conversationId))
        throw new MissingParentError()
      for (const [key, m] of [...materials])
        if (
          m.conversation_id === conversationId &&
          !documentIds.includes(m.document_id)
        )
          materials.delete(key)
      for (const documentId of documentIds) {
        if (!table('documents').has(documentId)) continue
        materials.set(`${conversationId}|${documentId}`, {
          conversation_id: conversationId,
          document_id: documentId,
        })
      }
    },

    async recordDeletions(rows: readonly DeletionRow[]) {
      failIfAsked('recordDeletions')
      for (const row of rows) {
        deletions.set(`${row.record_type}:${row.record_id}`, {
          ...copy(row),
          server_updated_at: tick(),
        })
      }
    },

    async remove(name, ids) {
      failIfAsked('remove')
      for (const id of ids) removeCascade(name, id)
    },

    async removeOriginals(documentIds) {
      failIfAsked('removeOriginals')
      for (const documentId of documentIds) {
        const folder = `${userId}/${documentId}/`
        for (const path of [...objects])
          if (path.startsWith(folder)) objects.delete(path)
      }
    },

    async pull(name, cursor, limit) {
      failIfAsked('pull')
      return [...table(name).values()]
        .map((row) => ({ row, at: row.server_updated_at, id: row.id }))
        .filter(after(cursor))
        .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit)
        .map(({ row }) => copy(row))
    },

    async pullDeletions(cursor, limit) {
      failIfAsked('pullDeletions')
      return [...deletions.values()]
        .map((row) => ({ row, at: row.server_updated_at, id: row.record_id }))
        .filter(after(cursor))
        .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit)
        .map(({ row }) => copy(row))
    },

    async chunksFor(documentIds) {
      failIfAsked('chunksFor')
      return [...chunks.values()]
        .filter((chunk) => documentIds.includes(chunk.document_id))
        .sort((a, b) => a.position - b.position)
        .map(copy)
    },

    async materialsFor(conversationIds) {
      failIfAsked('materialsFor')
      return [...materials.values()]
        .filter((m) => conversationIds.includes(m.conversation_id))
        .map(copy)
    },

    async eraseEverything() {
      failIfAsked('eraseEverything')
      const now = Date.now()
      for (const [name, rows] of tables) {
        await cloud.recordDeletions(
          [...rows.keys()].map((id) => ({
            record_type: name,
            record_id: id,
            deleted_at: now,
          })),
        )
      }
      for (const path of [...objects])
        if (path.startsWith(`${userId}/`)) objects.delete(path)
      for (const id of [...table('workspaces').keys()])
        removeCascade('workspaces', id)
    },
  }

  return {
    cloud,
    /** The stored rows of a table, for assertions. */
    rows: (name: CloudTable): Row[] => [...table(name).values()].map(copy),
    chunks: () => [...chunks.values()].map(copy),
    materials: () => [...materials.values()].map(copy),
    deletions: () => [...deletions.values()].map(copy),
    objects,
    /** Makes the next call to `method` reject with `error`. */
    failNext(method: keyof CloudStore, error: Error = new Error('offline')) {
      failures.set(method, error)
    },
  }
}
