import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import FormAlert from '../../features/auth/FormAlert.tsx'
import { useAuth } from '../../features/auth/auth-context.ts'
import {
  authErrorMessage,
  toAuthErrorCode,
} from '../../features/auth/auth-errors.ts'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_LINK,
} from '../../features/auth/auth-ui.ts'
import EnrolAuthenticator from '../../features/auth/mfa/EnrolAuthenticator.tsx'
import RemoveAuthenticator from '../../features/auth/mfa/RemoveAuthenticator.tsx'
import {
  factorLabel,
  nextFactorName,
} from '../../features/auth/mfa/factor-label.ts'
import { useFactors } from '../../features/auth/mfa/use-factors.ts'
import type { MfaFactor, TotpEnrollment } from '../../types/auth.ts'
import { H2 } from '../page-heading.ts'

const START_ID = 'mfa-start'
const NOTICE = '#mfa-notice [role="status"]'
const removeButtonId = (factorId: string) => `mfa-remove-${factorId}`

/**
 * "Two-step verification" section of the Account page: turn it on with an
 * authenticator app, add a backup, and remove one with a fresh code.
 */
export default function MfaSection() {
  const { mfa } = useAuth()
  const factors = useFactors()
  const list = factors.phase === 'ready' ? factors.factors : undefined
  const verified = list?.filter((f) => f.status === 'verified') ?? []

  const [enrolment, setEnrolment] = useState<TotpEnrollment | null>(null)
  const [starting, setStarting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // The factor being set up right now: removed if the user leaves the page
  // without confirming it.
  const pending = useRef<string | null>(null)
  // Where focus goes after the next render, as a CSS selector.
  const focusNext = useRef<string | null>(null)

  /** Removes an unconfirmed factor; resolves to whether it's gone. */
  const discard = useCallback(
    (factorId: string) =>
      mfa.unenroll(factorId).then(
        (result) => result.ok,
        () => false,
      ),
    [mfa],
  )

  // Leaving the page mid-setup abandons it.
  const discardOnLeave = useRef(discard)
  useEffect(() => {
    discardOnLeave.current = discard
  }, [discard])
  useEffect(
    () => () => {
      if (pending.current) void discardOnLeave.current(pending.current)
    },
    [],
  )

  useEffect(() => {
    if (!focusNext.current) return
    document.querySelector<HTMLElement>(focusNext.current)?.focus()
    // One try only: a target that didn't render must not steal focus later.
    focusNext.current = null
  })

  const showNotice = (text: string) => {
    setNotice(text)
    focusNext.current = NOTICE
  }

  async function startEnrolment() {
    setNotice(null)
    setActionError(null)
    setStarting(true)
    try {
      // Unconfirmed factors are left by setups that were abandoned (page
      // closed, connection lost). Clear them only now, when a new setup
      // starts, so merely opening Account on another device can't cancel a
      // setup in progress there. Read the list afresh: another tab may have
      // added one since this page loaded.
      const current = await mfa.listFactors()
      const confirmed = current.filter((f) => f.status === 'verified')
      const leftovers = current.filter((f) => f.status === 'unverified')
      const removed = await Promise.all(leftovers.map((f) => discard(f.id)))
      const stuck = leftovers.filter((_, index) => !removed[index])
      // Supabase refuses a name already taken, even by a stuck leftover.
      const name = nextFactorName([...confirmed, ...stuck])
      const next = await mfa.enrollTotp(name)
      pending.current = next.factorId
      setEnrolment(next)
    } catch (error) {
      setActionError(authErrorMessage(toAuthErrorCode(error)))
    } finally {
      setStarting(false)
    }
  }

  async function finishEnrolment() {
    const first = verified.length === 0
    pending.current = null
    await factors.reload()
    setEnrolment(null)
    showNotice(
      first ? 'Two-step verification is on.' : 'Backup authenticator added.',
    )
  }

  function cancelEnrolment() {
    if (pending.current) void discard(pending.current)
    pending.current = null
    setEnrolment(null)
    focusNext.current = `#${START_ID}`
  }

  async function finishRemoval() {
    const last = verified.length === 1
    await factors.reload()
    setRemovingId(null)
    showNotice(
      last
        ? 'Authenticator removed. Two-step verification is off.'
        : 'Authenticator removed.',
    )
  }

  function cancelRemoval(factorId: string) {
    setRemovingId(null)
    focusNext.current = `#${removeButtonId(factorId)}`
  }

  const on = verified.length > 0

  return (
    <section aria-labelledby="account-mfa">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="account-mfa" className={H2}>
          Two-step verification
        </h2>
        {list && <StatusPill on={on} />}
      </div>
      <p className="mt-3 max-w-[40rem] text-[15px] leading-[1.6] text-muted">
        After your password, SomaNami asks for a code from an authenticator app
        on your phone, so a stolen password alone can’t open your account.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        {notice && (
          <div id="mfa-notice">
            <FormAlert tone="success">{notice}</FormAlert>
          </div>
        )}
        {actionError && <FormAlert>{actionError}</FormAlert>}

        {factors.phase === 'loading' && (
          <p role="status" className="text-[15px] text-muted">
            Loading…
          </p>
        )}
        {factors.phase === 'error' && (
          <div className="flex flex-col items-start gap-4">
            <FormAlert>{factors.message}</FormAlert>
            <button
              type="button"
              onClick={() => void factors.reload()}
              className={SECONDARY_BUTTON}
            >
              Try again
            </button>
          </div>
        )}

        {list && on && (
          <FactorList
            factors={verified}
            removingId={enrolment ? null : removingId}
            onRemove={(id) => {
              setNotice(null)
              setActionError(null)
              setRemovingId(id)
            }}
            renderRemoval={(factor, name) => (
              <RemoveAuthenticator
                factorId={factor.id}
                name={name}
                mfa={mfa}
                onRemoved={() => void finishRemoval()}
                onCancel={() => cancelRemoval(factor.id)}
              />
            )}
          />
        )}

        {list && on && verified.length === 1 && (
          <p className="max-w-[40rem] text-[15px] leading-[1.6] text-fg">
            If you lose your phone, you won’t be able to sign in. Add a second
            authenticator, on another device, as a backup.
          </p>
        )}
      </div>

      {list &&
        (enrolment ? (
          <EnrolAuthenticator
            enrollment={enrolment}
            first={!on}
            verify={mfa.verify}
            onVerified={() => void finishEnrolment()}
            onCancel={cancelEnrolment}
          />
        ) : (
          <button
            id={START_ID}
            type="button"
            disabled={starting}
            onClick={() => void startEnrolment()}
            className={
              on
                ? `${SECONDARY_BUTTON} mt-5 disabled:opacity-60`
                : `${PRIMARY_BUTTON} mt-5 sm:w-auto`
            }
          >
            {starting
              ? 'Starting…'
              : on
                ? 'Add a backup authenticator'
                : 'Turn on two-step verification'}
          </button>
        ))}
    </section>
  )
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[12px] leading-[1.5] font-medium tracking-[0.06em] uppercase ${
        on ? 'bg-success-soft text-success' : 'bg-tint text-muted'
      }`}
    >
      {on ? 'On' : 'Off'}
    </span>
  )
}

interface FactorListProps {
  factors: MfaFactor[]
  removingId: string | null
  onRemove: (factorId: string) => void
  renderRemoval: (factor: MfaFactor, name: string) => ReactNode
}

function FactorList({
  factors,
  removingId,
  onRemove,
  renderRemoval,
}: FactorListProps) {
  return (
    <ul
      aria-label="Your authenticators"
      className="divide-y divide-line rounded-[12px] border border-line bg-surface"
    >
      {factors.map((factor, index) => {
        const name = factorLabel(factor, index)
        return (
          <li key={factor.id} className="px-5 py-4">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] font-medium text-fg">{name}</span>
              {removingId !== factor.id && (
                <button
                  id={removeButtonId(factor.id)}
                  type="button"
                  onClick={() => onRemove(factor.id)}
                  aria-label={`Remove ${name}`}
                  className={`${TEXT_LINK} min-h-11 cursor-pointer px-1 text-[14px]`}
                >
                  Remove
                </button>
              )}
            </div>
            {removingId === factor.id && renderRemoval(factor, name)}
          </li>
        )
      })}
    </ul>
  )
}
