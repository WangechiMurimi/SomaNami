import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewDocument } from '../../types/contracts.ts'
import {
  appendMessage,
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  deleteDocument,
  getConversation,
  getDocument,
  getWorkspace,
  listMessages,
  listOutbox,
  moveDocument,
  renameConversation,
  saveDocument,
  setStorageAdapter,
  updateWorkspace,
} from '../storage/index.ts'
import type { StorageAdapter } from '../storage/index.ts'
import { syncOnce } from './engine.ts'
import { createMemoryCloud } from './testing/memory-cloud.ts'

// Two devices of one learner sharing one cloud. Storage is a module-level
// store, so each step swaps in the device it runs on.
let laptop: StorageAdapter
let phone: StorageAdapter
let cloud: ReturnType<typeof createMemoryCloud>

const on = async <T>(device: StorageAdapter, work: () => Promise<T>) => {
  setStorageAdapter(device)
  return work()
}

// Last-write-wins compares client clocks, so tests control them.
let now = 1_000_000
const at = (time: number) => {
  now = time
  vi.setSystemTime(now)
}

const doc = (id: string): NewDocument => ({
  id,
  name: `${id}.txt`,
  size: 10,
  kind: 'text',
  pageCount: null,
  chunks: [
    {
      id: `${id}:0`,
      text: 'Cells divide.',
      source: { type: 'line', startLine: 1, endLine: 1 },
    },
    {
      id: `${id}:1`,
      text: 'Mitosis.',
      source: { type: 'line', startLine: 2, endLine: 2 },
    },
  ],
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(1_000_000)
  laptop = createMemoryAdapter()
  phone = createMemoryAdapter()
  cloud = createMemoryCloud()
})

afterEach(() => {
  setStorageAdapter(null)
  vi.useRealTimers()
})

/** A workspace with one document and a conversation with one exchange. */
async function seedLaptop() {
  return on(laptop, async () => {
    const workspace = await createWorkspace({ name: 'Biology' })
    await saveDocument(doc('d1'), workspace.id)
    const conversation = await createConversation({
      workspaceId: workspace.id,
      materialIds: ['d1'],
      title: 'Cells',
    })
    await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'What divides?',
    })
    // Messages are ordered by time; equal times would order them by random id.
    at(now + 1)
    await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Cells.',
      citations: [{ documentId: 'd1', chunkId: 'd1:0' }],
      answerable: true,
    })
    return { workspace, conversation }
  })
}

describe('syncOnce', () => {
  it('pushes everything a device has and empties its outbox', async () => {
    const { workspace, conversation } = await seedLaptop()

    const result = await on(laptop, () => syncOnce(cloud.cloud))

    expect(result.pending).toBe(0)
    expect(await on(laptop, listOutbox)).toEqual([])
    expect(cloud.rows('workspaces').map((r) => r.id)).toEqual([workspace.id])
    expect(cloud.rows('documents')).toMatchObject([
      { id: 'd1', workspace_id: workspace.id },
    ])
    expect(cloud.chunks().map((c) => [c.id, c.position])).toEqual([
      ['d1:0', 0],
      ['d1:1', 1],
    ])
    expect(cloud.materials()).toEqual([
      { conversation_id: conversation.id, document_id: 'd1' },
    ])
    expect(cloud.rows('messages')).toHaveLength(2)
  })

  it('brings a second device everything, chunks and citations included', async () => {
    const { workspace, conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))

    const result = await on(phone, () => syncOnce(cloud.cloud))

    expect(result.pulled).toBeGreaterThan(0)
    await on(phone, async () => {
      expect(await getWorkspace(workspace.id)).toMatchObject({
        name: 'Biology',
      })
      expect((await getDocument('d1'))?.chunks.map((c) => c.text)).toEqual([
        'Cells divide.',
        'Mitosis.',
      ])
      expect(await getConversation(conversation.id)).toMatchObject({
        materialIds: ['d1'],
      })
      const messages = await listMessages(conversation.id)
      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
      expect(messages[1]).toMatchObject({
        citations: [{ documentId: 'd1', chunkId: 'd1:0' }],
        answerable: true,
      })
      // Pulled records are not queued to be pushed back.
      expect(await listOutbox()).toEqual([])
    })
  })

  it('delivers an edit made offline once the device syncs again', async () => {
    const { conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    // Offline: the edit only reaches the outbox.
    at(2_000_000)
    await on(laptop, () => renameConversation(conversation.id, 'Cell division'))
    expect(cloud.rows('conversations')[0]).toMatchObject({ title: 'Cells' })

    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    expect(
      await on(phone, () => getConversation(conversation.id)),
    ).toMatchObject({
      title: 'Cell division',
    })
  })

  it('delivers a moved material, and the chats that dropped it, to another device', async () => {
    const { conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    at(2_000_000)
    const history = await on(laptop, () => createWorkspace({ name: 'History' }))
    await on(laptop, () => moveDocument('d1', history.id))
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    expect(await on(phone, () => getDocument('d1'))).toMatchObject({
      workspaceId: history.id,
    })
    expect(
      await on(phone, () => getConversation(conversation.id)),
    ).toMatchObject({ materialIds: [] })
  })

  it('keeps the newer edit when two devices change the same record', async () => {
    const { workspace } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    at(2_000_000)
    await on(phone, () =>
      updateWorkspace(workspace.id, { name: 'Phone (newer)' }),
    )
    at(1_500_000)
    await on(laptop, () =>
      updateWorkspace(workspace.id, { name: 'Laptop (older)' }),
    )

    // Order of syncing doesn't matter: the newer edit wins everywhere.
    await on(phone, () => syncOnce(cloud.cloud))
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    expect(cloud.rows('workspaces')[0]).toMatchObject({ name: 'Phone (newer)' })
    expect(await on(laptop, () => getWorkspace(workspace.id))).toMatchObject({
      name: 'Phone (newer)',
    })
    expect(await on(laptop, listOutbox)).toEqual([])
  })

  it('deletes everywhere, original file included, and the cascade runs on each device', async () => {
    const { conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))
    cloud.objects.add('user-a/d1/d1.txt')

    at(2_000_000)
    await on(laptop, () => deleteDocument('d1'))
    await on(laptop, () => syncOnce(cloud.cloud))

    expect(cloud.rows('documents')).toEqual([])
    expect(cloud.chunks()).toEqual([])
    expect(cloud.objects.has('user-a/d1/d1.txt')).toBe(false)
    expect(
      cloud.deletions().map((d) => [d.record_type, d.record_id]),
    ).toContainEqual(['documents', 'd1'])

    await on(phone, () => syncOnce(cloud.cloud))
    await on(phone, async () => {
      expect(await getDocument('d1')).toBeUndefined()
      // The conversation had no other material, so it goes too, as on the laptop.
      expect(await getConversation(conversation.id)).toBeUndefined()
      expect(await listMessages(conversation.id)).toEqual([])
    })
  })

  it('never lets a deleted material come back from a device that was offline', async () => {
    const { workspace } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    // The phone edits the document while offline...
    at(1_500_000)
    await on(phone, async () => {
      const stored = await getDocument('d1')
      await saveDocument({ ...stored!, name: 'renamed.txt' }, workspace.id)
    })
    // ...while the laptop deletes it and syncs.
    at(2_000_000)
    await on(laptop, () => deleteDocument('d1'))
    await on(laptop, () => syncOnce(cloud.cloud))

    await on(phone, () => syncOnce(cloud.cloud))

    expect(cloud.rows('documents')).toEqual([])
    expect(await on(phone, () => getDocument('d1'))).toBeUndefined()
    expect(await on(phone, listOutbox)).toEqual([])
  })

  it('still refuses the stale copy when the delete lands between this device’s pull and push', async () => {
    const { workspace } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    at(1_500_000)
    await on(phone, async () => {
      const stored = await getDocument('d1')
      await saveDocument({ ...stored!, name: 'renamed.txt' }, workspace.id)
    })

    // Another device deletes d1 just after the phone's last pull, so only
    // the server's rule can stop the phone's push from bringing it back.
    const pull = cloud.cloud.pull
    cloud.cloud.pull = async (table, cursor, limit) => {
      const rows = await pull(table, cursor, limit)
      if (table === 'messages') {
        await cloud.cloud.recordDeletions([
          { record_type: 'documents', record_id: 'd1', deleted_at: 2_000_000 },
        ])
        await cloud.cloud.remove('documents', ['d1'])
      }
      return rows
    }
    await on(phone, () => syncOnce(cloud.cloud))
    cloud.cloud.pull = pull

    expect(cloud.rows('documents')).toEqual([])
    // The next sync brings the deletion to the phone.
    await on(phone, () => syncOnce(cloud.cloud))
    expect(await on(phone, () => getDocument('d1'))).toBeUndefined()
  })

  it('drops a change whose parent was deleted elsewhere instead of failing forever', async () => {
    const { conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    // The laptop deletes the conversation; the phone, offline, adds to it.
    at(2_000_000)
    await on(laptop, async () => {
      const { deleteConversation } = await import('../storage/index.ts')
      await deleteConversation(conversation.id)
    })
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () =>
      appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Late',
      }),
    )

    const result = await on(phone, () => syncOnce(cloud.cloud))

    expect(result.pending).toBe(0)
    expect(cloud.rows('messages')).toEqual([])
    expect(
      await on(phone, () => getConversation(conversation.id)),
    ).toBeUndefined()
  })

  it('keeps unpushed changes when the cloud is unreachable, and pushes them next time', async () => {
    await seedLaptop()
    cloud.failNext('upsert')

    await expect(on(laptop, () => syncOnce(cloud.cloud))).rejects.toThrow(
      'offline',
    )
    expect((await on(laptop, listOutbox)).length).toBeGreaterThan(0)

    const result = await on(laptop, () => syncOnce(cloud.cloud))
    expect(result.pending).toBe(0)
    expect(cloud.rows('documents')).toHaveLength(1)
  })

  it('does not lose an edit made while a push was in flight', async () => {
    const { workspace } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))

    at(2_000_000)
    await on(laptop, () => updateWorkspace(workspace.id, { name: 'First' }))
    // Edit again while the upsert of "First" is being sent.
    const upsert = cloud.cloud.upsert
    cloud.cloud.upsert = async (table, rows) => {
      const written = await upsert(table, rows)
      if (table === 'workspaces') {
        at(3_000_000)
        await updateWorkspace(workspace.id, { name: 'Second' })
      }
      return written
    }
    await on(laptop, () => syncOnce(cloud.cloud))
    cloud.cloud.upsert = upsert

    // The second edit is still queued, and the next sync delivers it.
    expect(await on(laptop, listOutbox)).toMatchObject([
      { recordId: workspace.id },
    ])
    await on(laptop, () => syncOnce(cloud.cloud))
    expect(cloud.rows('workspaces')[0]).toMatchObject({ name: 'Second' })
  })

  it('pulls nothing twice: a quiet second sync changes nothing', async () => {
    await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    expect(await on(phone, () => syncOnce(cloud.cloud))).toEqual({
      pulled: 0,
      pushed: 0,
      pending: 0,
    })
  })
})

describe('eraseEverything (#147)', () => {
  it('empties the cloud and wipes every other device on its next sync', async () => {
    const { workspace, conversation } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))
    cloud.objects.add('user-a/d1/d1.txt')
    // A file whose row never synced goes too.
    cloud.objects.add('user-a/lost/orphan.pdf')

    at(2_000_000)
    await cloud.cloud.eraseEverything()

    for (const table of [
      'workspaces',
      'documents',
      'conversations',
      'messages',
    ] as const)
      expect(cloud.rows(table)).toEqual([])
    expect(cloud.chunks()).toEqual([])
    expect(cloud.materials()).toEqual([])
    expect([...cloud.objects]).toEqual([])

    await on(phone, () => syncOnce(cloud.cloud))
    await on(phone, async () => {
      expect(await getWorkspace(workspace.id)).toBeUndefined()
      expect(await getDocument('d1')).toBeUndefined()
      expect(await getConversation(conversation.id)).toBeUndefined()
      expect(await listMessages(conversation.id)).toEqual([])
    })
  })

  it('refuses what an offline device still holds, so nothing comes back', async () => {
    const { workspace } = await seedLaptop()
    await on(laptop, () => syncOnce(cloud.cloud))
    await on(phone, () => syncOnce(cloud.cloud))

    // The phone edits while offline, before the erase happens elsewhere.
    at(1_500_000)
    await on(phone, () =>
      updateWorkspace(workspace.id, { name: 'Offline edit' }),
    )
    at(2_000_000)
    await cloud.cloud.eraseEverything()

    await on(phone, () => syncOnce(cloud.cloud))

    expect(cloud.rows('workspaces')).toEqual([])
    expect(await on(phone, () => getWorkspace(workspace.id))).toBeUndefined()
  })
})
