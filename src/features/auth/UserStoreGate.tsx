import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  closeUserStore,
  declineLegacyImport,
  hasLegacyMaterials,
  importLegacyMaterials,
  isUserStoreOpen,
  legacyImportDeclined,
  openUserStore,
} from '../../lib/storage/index.ts'
import { useAuth } from './auth-context.ts'
import LegacyImportDialog from './LegacyImportDialog.tsx'

type Outcome = 'ready' | 'failed' | 'offer-import'

// A failed check must never stand between someone and their own library, so
// it reads as "nothing to offer" and the materials stay put for next time.
async function shouldOfferImport(userId: string): Promise<boolean> {
  if (legacyImportDeclined(userId)) return false
  try {
    return await hasLegacyMaterials()
  } catch {
    return false
  }
}

/**
 * Opens the signed-in user's private local store before rendering anything
 * that reads storage, and closes it on sign-out or a user switch.
 */
export default function UserStoreGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const userId =
    status === 'signed-in' || status === 'signed-in-offline'
      ? user?.id
      : undefined
  const [attempt, setAttempt] = useState(0)
  // Each outcome is tagged with the open it belongs to, so one that lands after
  // a user switch (or a retry) is ignored rather than shown for the wrong user.
  const openKey = userId ? `${userId}:${attempt}` : undefined
  const [result, setResult] = useState<{ key: string; outcome: Outcome }>()

  useEffect(() => {
    if (!userId || !openKey) return
    let active = true
    openUserStore(userId).then(
      async () => {
        const offer = await shouldOfferImport(userId)
        if (active)
          setResult({ key: openKey, outcome: offer ? 'offer-import' : 'ready' })
      },
      () => {
        if (active) setResult({ key: openKey, outcome: 'failed' })
      },
    )
    return () => {
      active = false
      closeUserStore()
    }
  }, [userId, openKey])

  const settle = useCallback(() => {
    if (openKey) setResult({ key: openKey, outcome: 'ready' })
  }, [openKey])

  if (!userId) return null

  // A store that is already usable needs no loading flash; the effect still
  // runs its checks and settles on the same outcome.
  const outcome =
    result && result.key === openKey
      ? result.outcome
      : isUserStoreOpen(userId)
        ? 'ready'
        : 'opening'

  if (outcome === 'ready') return children

  if (outcome === 'offer-import')
    return (
      <LegacyImportDialog
        onMove={async () => {
          await importLegacyMaterials()
          settle()
        }}
        onLeave={() => {
          declineLegacyImport(userId)
          settle()
        }}
        onLater={settle}
      />
    )

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 text-center">
      {outcome === 'failed' ? (
        <div role="alert" className="max-w-[28rem]">
          <p className="text-[15px] leading-[1.6] text-fg">
            We couldn’t open your materials on this device.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 inline-flex h-11 items-center rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted">
          Opening your materials…
        </p>
      )}
    </div>
  )
}
