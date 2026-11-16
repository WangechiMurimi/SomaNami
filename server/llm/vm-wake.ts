import type { PowerState, VmPowerClient } from '../azure/vm-power.ts'
import { UpstreamError } from './answerer.ts'
import type { Answerer, AnswerOutcome } from './answerer.ts'

/**
 * How long the reachability probe may take. A deallocated VM's address drops
 * packets rather than refusing them, so without this cap a sleeping VM would
 * cost the whole answer deadline before we even knew to wake it.
 */
export const PROBE_TIMEOUT_MS = 1_500

/**
 * The ARM part of a wake (token, power state, start) shares one deadline,
 * so probe plus wake stays far inside the function's time limit.
 */
export const WAKE_TIMEOUT_MS = 3_000

/**
 * After a successful call, skip the probe for this long. It is well under the
 * VM's idle window (30 min by default), so the VM can't have gone to sleep
 * behind a fresh entry except by the nightly backstop or by hand; the next
 * failed call then clears it.
 */
export const REACHABLE_TTL_MS = 5 * 60_000

/**
 * A VM that ARM reports running but whose gateway doesn't answer is treated
 * as still booting (Ollama and Caddy starting) for this long after its last
 * start; after that, the failure is real and is reported as such.
 */
export const BOOT_GRACE_MS = 5 * 60_000

/** Retry hints, in seconds, by how far along the VM is. */
export const RETRY_AFTER_SECONDS = {
  /** Deallocated or stopped: the start was just requested. */
  asleep: 30,
  /** ARM is starting the VM. */
  starting: 20,
  /** Running, services still coming up. */
  booting: 10,
} as const

const ASLEEP: readonly PowerState[] = [
  'stopped',
  'deallocated',
  'stopping',
  'deallocating',
]

export interface VmWakeOptions {
  vm: VmPowerClient
  /** Resolves `true` if the gateway is up; see `createOllamaProbe`. */
  probe: (signal: AbortSignal) => Promise<boolean>
  /**
   * The answerer's total budget. Time the probe used is taken from it, so
   * probe plus answer never outlasts the answerer on its own.
   */
  answerTimeoutMs: number
  /** Injected in tests; defaults to `Date.now`. */
  now?: () => number
}

/**
 * Wraps the Ollama answerer so a sleeping VM is started instead of failing
 * the chat (#201). When the gateway can't be reached, it asks ARM for the
 * VM's power state, starts it if needed, and returns a `model-waking`
 * outcome; any other failure passes through untouched.
 */
export function withVmWake(
  answer: Answerer,
  { vm, probe, answerTimeoutMs, now = Date.now }: VmWakeOptions,
): Answerer {
  let reachableUntil = 0
  // One start request per instance at a time; ARM treats repeats as no-ops,
  // but there is no reason to spend the calls.
  let starting: Promise<void> | null = null

  return async (request, options = {}) => {
    const began = now()
    if (now() >= reachableUntil) {
      const up = await probe(timeoutSignal(PROBE_TIMEOUT_MS, options.signal))
      if (!up) {
        return wakeOr(new UpstreamError('unreachable', 'Ollama is unreachable'))
      }
    }

    const remaining = Math.max(1, answerTimeoutMs - (now() - began))
    try {
      const outcome = await answer(request, {
        signal: timeoutSignal(remaining, options.signal),
      })
      reachableUntil = now() + REACHABLE_TTL_MS
      return outcome
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error
      if (error.kind === 'unreachable' || error.kind === 'timeout') {
        reachableUntil = 0
      }
      // A timeout after a good probe means a slow model, not a sleeping VM,
      // and there is no time left to ask ARM anyway.
      if (error.kind === 'unreachable') return wakeOr(error)
      throw error
    }
  }

  /** Wakes the VM if it is asleep or booting; otherwise rethrows `failure`. */
  async function wakeOr(failure: UpstreamError): Promise<AnswerOutcome> {
    const signal = timeoutSignal(WAKE_TIMEOUT_MS)
    try {
      const { powerState, lastOperationAt } = await vm.getInstanceView({
        signal,
      })
      if (ASLEEP.includes(powerState)) {
        starting ??= vm.start({ signal }).finally(() => {
          starting = null
        })
        await starting
        console.info(`Model VM was ${powerState}; start requested`)
        return waking(RETRY_AFTER_SECONDS.asleep)
      }
      if (powerState === 'starting') {
        return waking(RETRY_AFTER_SECONDS.starting)
      }
      if (
        powerState === 'running' &&
        lastOperationAt !== null &&
        now() - lastOperationAt < BOOT_GRACE_MS
      ) {
        return waking(RETRY_AFTER_SECONDS.booting)
      }
    } catch (armError) {
      // Only the kind is logged; ArmError messages hold no secrets, but a
      // network cause might quote the URL, which names the subscription.
      const kind = (armError as { kind?: string }).kind ?? 'unknown'
      console.error(`Could not wake the model VM (${kind})`)
    }
    throw failure
  }
}

const waking = (retryAfterSeconds: number): AnswerOutcome => ({
  kind: 'model-waking',
  retryAfterSeconds,
})

/** A timeout signal that also follows `parent`; uses fakeable timers. */
function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  // Don't keep a dev server's event loop alive for an unused deadline.
  ;(timer as { unref?: () => void }).unref?.()
  return parent
    ? AbortSignal.any([controller.signal, parent])
    : controller.signal
}
