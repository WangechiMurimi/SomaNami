import { useEffect, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import { listConversations } from '../../lib/storage/index.ts'
import { count } from '../../lib/text/count.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import { useSync } from '../sync/sync-context.ts'
import { useLibraryContext } from './library-context.ts'

/** What removing a material does to the chats that use it (US-08 AC5). */
export default function RemoveMaterialDialog({
  material,
  onDone,
}: {
  material: StoredDocument
  /** Called with what to tell the learner, or nothing if they cancelled. */
  onDone: (notice?: string) => void
}) {
  const { remove } = useLibraryContext()
  const { status: sync, flush } = useSync()
  const inCloud = sync !== 'off'
  const [effect, setEffect] = useState<{ ending: number; keeping: number }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listConversations(material.id).then(
      (using) => {
        if (cancelled) return
        const ending = using.filter(({ materialIds }) =>
          materialIds.every((id) => id === material.id),
        ).length
        setEffect({ ending, keeping: using.length - ending })
      },
      () => !cancelled && setEffect({ ending: 0, keeping: 0 }),
    )
    return () => {
      cancelled = true
    }
  }, [material.id])

  const confirm = async () => {
    setBusy(true)
    try {
      await remove(material.id)
    } catch (cause) {
      console.error('Could not remove the material', cause)
      setError('We couldn’t remove it. Try again.')
      setBusy(false)
      return
    }
    // Deleted here and queued for the cloud; only say "deleted" once the
    // cloud has confirmed it (#147). If it can't yet, the queue keeps it and
    // a later sync finishes the job, so say exactly that.
    try {
      await flush()
      onDone(`‘${material.name}’ deleted`)
    } catch {
      onDone(
        `‘${material.name}’ is removed from your library. We couldn’t reach SomaNami to erase it from your account yet; we’ll finish as soon as we can.`,
      )
    }
  }

  return (
    <ConfirmDialog
      title={`Remove ${material.name}?`}
      confirmLabel="Remove"
      busy={busy || !effect}
      onConfirm={() => void confirm()}
      onCancel={() => onDone()}
    >
      <p>
        {inCloud
          ? 'It will be deleted from your account and all your devices, original file included.'
          : 'It will be deleted.'}
      </p>
      {effect && effect.ending > 0 && (
        <p className="mt-2">
          {count(effect.ending, 'chat', 'chats')} that only used this material
          will be removed too.
        </p>
      )}
      {effect && effect.keeping > 0 && (
        <p className="mt-2">
          {count(effect.keeping, 'chat', 'chats')} that also{' '}
          {effect.keeping === 1 ? 'uses' : 'use'} other materials will keep
          those, and earlier answers that quoted this one will no longer show
          the passage.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-warn">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}
