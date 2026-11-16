// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NewDocument } from '../../types/contracts.ts'
import {
  appendMessage,
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  deleteDocument,
  getConversation,
  getDocument,
  listMessages,
  listOutbox,
  saveDocument,
  setStorageAdapter,
} from '../storage/index.ts'
import type { StorageAdapter } from '../storage/index.ts'
import { MATERIALS_BUCKET } from '../storage-cloud/originals.ts'
import { syncOnce } from './engine.ts'
import { createSupabaseCloud } from './supabase-cloud.ts'

// Runs against the local Supabase stack only (`npm run db:start`), so the
// real queries, RLS and triggers are exercised. Skipped unless the stack's
// URL and keys are given, e.g.:
//   eval "$(supabase status -o env | sed 's/^/export SYNC_IT_/')" && \
//   npx vitest run src/lib/sync/supabase-cloud.integration.test.ts
const url = process.env.SYNC_IT_API_URL
const anonKey = process.env.SYNC_IT_ANON_KEY
const serviceKey = process.env.SYNC_IT_SERVICE_ROLE_KEY

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

describe.skipIf(!url || !anonKey || !serviceKey)(
  'sync against local Supabase',
  () => {
    let admin: SupabaseClient
    const users: { id: string; client: SupabaseClient }[] = []

    async function signedInUser() {
      const email = `sync-${crypto.randomUUID()}@example.test`
      const password = crypto.randomUUID()
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error
      const client = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const signIn = await client.auth.signInWithPassword({ email, password })
      if (signIn.error) throw signIn.error
      const user = { id: data.user.id, client }
      users.push(user)
      return user
    }

    const on = async <T>(device: StorageAdapter, work: () => Promise<T>) => {
      setStorageAdapter(device)
      return work()
    }

    beforeAll(() => {
      admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    })

    afterAll(async () => {
      setStorageAdapter(null)
      // Deleting the account cascades to every row it owned.
      for (const { id } of users) {
        await admin.storage.from(MATERIALS_BUCKET).remove([`${id}/d1/d1.txt`])
        await admin.auth.admin.deleteUser(id)
      }
    })

    it('syncs two devices, then deletes everywhere, file included', async () => {
      const learner = await signedInUser()
      const cloud = createSupabaseCloud(learner.client, learner.id)
      const laptop = createMemoryAdapter()
      const phone = createMemoryAdapter()

      const { conversation } = await on(laptop, async () => {
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
          content: 'Q',
        })
        return { conversation }
      })
      const upload = await learner.client.storage
        .from(MATERIALS_BUCKET)
        .upload(`${learner.id}/d1/d1.txt`, new Blob(['original']))
      expect(upload.error).toBeNull()

      expect(await on(laptop, () => syncOnce(cloud))).toMatchObject({
        pending: 0,
      })
      await on(phone, () => syncOnce(cloud))

      await on(phone, async () => {
        expect((await getDocument('d1'))?.chunks.map((c) => c.id)).toEqual([
          'd1:0',
          'd1:1',
        ])
        expect(await getConversation(conversation.id)).toMatchObject({
          materialIds: ['d1'],
        })
        expect(await listMessages(conversation.id)).toHaveLength(1)
        expect(await listOutbox()).toEqual([])
      })

      await on(laptop, () => deleteDocument('d1'))
      expect(await on(laptop, () => syncOnce(cloud))).toMatchObject({
        pending: 0,
      })
      await on(phone, () => syncOnce(cloud))

      expect(await on(phone, () => getDocument('d1'))).toBeUndefined()
      expect(
        await on(phone, () => getConversation(conversation.id)),
      ).toBeUndefined()
      const listed = await learner.client.storage
        .from(MATERIALS_BUCKET)
        .list(`${learner.id}/d1`)
      expect(listed.data).toEqual([])
      const rows = await learner.client.from('documents').select('id')
      expect(rows.data).toEqual([])
    })

    it('erases every row and file, and another device follows (#147)', async () => {
      const learner = await signedInUser()
      const cloud = createSupabaseCloud(learner.client, learner.id)
      const laptop = createMemoryAdapter()
      const phone = createMemoryAdapter()
      await on(laptop, async () => {
        const workspace = await createWorkspace({ name: 'Biology' })
        await saveDocument(doc('d1'), workspace.id)
        await createConversation({
          workspaceId: workspace.id,
          materialIds: ['d1'],
          title: 'Cells',
        })
      })
      const bucket = learner.client.storage.from(MATERIALS_BUCKET)
      await bucket.upload(`${learner.id}/d1/d1.txt`, new Blob(['original']))
      // A file whose row never made it to the cloud.
      await bucket.upload(`${learner.id}/lost/orphan.pdf`, new Blob(['x']))
      await on(laptop, () => syncOnce(cloud))
      await on(phone, () => syncOnce(cloud))

      await cloud.eraseEverything()

      for (const table of [
        'workspaces',
        'documents',
        'chunks',
        'conversations',
        'conversation_materials',
        'messages',
      ]) {
        const { data } = await learner.client.from(table).select('*')
        expect(data, table).toEqual([])
      }
      const { data: folders } = await bucket.list(learner.id)
      expect(folders).toEqual([])

      await on(phone, () => syncOnce(cloud))
      expect(await on(phone, () => getDocument('d1'))).toBeUndefined()
    })

    it('shows one learner nothing of another’s', async () => {
      const a = await signedInUser()
      const b = await signedInUser()
      await on(createMemoryAdapter(), async () => {
        const workspace = await createWorkspace({ name: 'Private' })
        await saveDocument(doc('d1'), workspace.id)
        await syncOnce(createSupabaseCloud(a.client, a.id))
      })

      const other = createMemoryAdapter()
      const result = await on(other, () =>
        syncOnce(createSupabaseCloud(b.client, b.id)),
      )

      expect(result.pulled).toBe(0)
      expect(await on(other, () => getDocument('d1'))).toBeUndefined()
    })

    it('lets the server keep the newer edit when a stale one arrives', async () => {
      const learner = await signedInUser()
      const cloud = createSupabaseCloud(learner.client, learner.id)
      const row = {
        id: 'w1',
        name: 'New',
        topic: '',
        description: '',
        created_at: 1,
        updated_at: 200,
      }

      expect(await cloud.upsert('workspaces', [row])).toEqual(['w1'])
      expect(
        await cloud.upsert('workspaces', [
          { ...row, name: 'Stale', updated_at: 100 },
        ]),
      ).toEqual([])

      const { data } = await learner.client.from('workspaces').select('name')
      expect(data).toEqual([{ name: 'New' }])
    })
  },
)
