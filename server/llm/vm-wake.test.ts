// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArmError } from '../azure/vm-power.ts'
import type { PowerState, VmPowerClient } from '../azure/vm-power.ts'
import { UpstreamError } from './answerer.ts'
import type { Answerer, AnswerRequest } from './answerer.ts'
import {
  BOOT_GRACE_MS,
  PROBE_TIMEOUT_MS,
  REACHABLE_TTL_MS,
  RETRY_AFTER_SECONDS,
  withVmWake,
} from './vm-wake.ts'

const request: AnswerRequest = {
  question: 'Why ATP?',
  passages: [],
  history: [],
}
const ANSWER = {
  kind: 'answer' as const,
  answer: { answer: 'ATP.', answerable: true, citations: [] },
}
const NOW = Date.parse('2026-11-16T12:00:00Z')

function fakeVm(powerState: PowerState, lastOperationAt: number | null = 0) {
  return {
    getInstanceView: vi
      .fn<VmPowerClient['getInstanceView']>()
      .mockResolvedValue({ powerState, lastOperationAt }),
    start: vi.fn<VmPowerClient['start']>().mockResolvedValue(undefined),
  }
}

function setup({
  vm = fakeVm('running'),
  up = true,
  answer = vi.fn<Answerer>().mockResolvedValue(ANSWER),
}: {
  vm?: ReturnType<typeof fakeVm>
  up?: boolean
  answer?: ReturnType<typeof vi.fn<Answerer>>
} = {}) {
  let time = NOW
  const probe = vi
    .fn<(signal: AbortSignal) => Promise<boolean>>()
    .mockResolvedValue(up)
  const wrapped = withVmWake(answer, {
    vm,
    probe,
    answerTimeoutMs: 7_000,
    now: () => time,
  })
  return {
    wrapped,
    answer,
    probe,
    vm,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('withVmWake', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('answers normally when the gateway is up, without touching ARM', async () => {
    const { wrapped, vm, answer } = setup()

    await expect(wrapped(request)).resolves.toEqual(ANSWER)

    expect(answer).toHaveBeenCalledWith(request, {
      signal: expect.any(AbortSignal),
    })
    expect(vm.getInstanceView).not.toHaveBeenCalled()
    expect(vm.start).not.toHaveBeenCalled()
  })

  it('probes once, then trusts a recent success until the TTL lapses', async () => {
    const { wrapped, probe, advance } = setup()

    await wrapped(request)
    advance(REACHABLE_TTL_MS - 1)
    await wrapped(request)
    expect(probe).toHaveBeenCalledOnce()

    // Each success renews the window, so only a full TTL of silence lapses it.
    advance(REACHABLE_TTL_MS)
    await wrapped(request)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it.each(['deallocated', 'stopped', 'deallocating', 'stopping'] as const)(
    'starts a %s VM and reports model-waking instead of an error',
    async (state) => {
      const { wrapped, vm, answer } = setup({ vm: fakeVm(state), up: false })

      await expect(wrapped(request)).resolves.toEqual({
        kind: 'model-waking',
        retryAfterSeconds: RETRY_AFTER_SECONDS.asleep,
      })
      expect(vm.start).toHaveBeenCalledOnce()
      expect(answer).not.toHaveBeenCalled()
    },
  )

  it('reports a starting VM as waking without asking ARM to start it again', async () => {
    const { wrapped, vm } = setup({ vm: fakeVm('starting'), up: false })

    await expect(wrapped(request)).resolves.toEqual({
      kind: 'model-waking',
      retryAfterSeconds: RETRY_AFTER_SECONDS.starting,
    })
    expect(vm.start).not.toHaveBeenCalled()
  })

  it('treats a running VM started moments ago as still booting', async () => {
    const vm = fakeVm('running', NOW - 60_000)
    const { wrapped } = setup({ vm, up: false })

    await expect(wrapped(request)).resolves.toEqual({
      kind: 'model-waking',
      retryAfterSeconds: RETRY_AFTER_SECONDS.booting,
    })
    expect(vm.start).not.toHaveBeenCalled()
  })

  it('reports a long-running VM whose gateway is down as unreachable', async () => {
    const vm = fakeVm('running', NOW - BOOT_GRACE_MS)
    const { wrapped } = setup({ vm, up: false })

    await expect(wrapped(request)).rejects.toMatchObject({
      kind: 'unreachable',
    })
  })

  it('keeps the original failure when ARM fails, logging only its kind', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const vm = fakeVm('deallocated')
    vm.getInstanceView.mockRejectedValue(
      new ArmError('forbidden', 'Azure Resource Manager answered 403'),
    )
    const { wrapped } = setup({ vm, up: false })

    await expect(wrapped(request)).rejects.toMatchObject({
      kind: 'unreachable',
    })
    expect(log).toHaveBeenCalledWith('Could not wake the model VM (forbidden)')
  })

  it('keeps the original failure when the start call fails', async () => {
    const vm = fakeVm('deallocated')
    vm.start.mockRejectedValue(new ArmError('throttled', 'ARM answered 429'))
    const { wrapped } = setup({ vm, up: false })

    await expect(wrapped(request)).rejects.toBeInstanceOf(UpstreamError)
  })

  it('shares one start between concurrent requests', async () => {
    const vm = fakeVm('deallocated')
    let release: () => void = () => {}
    vm.start.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const { wrapped } = setup({ vm, up: false })

    const both = Promise.all([wrapped(request), wrapped(request)])
    await vi.waitFor(() => expect(vm.getInstanceView).toHaveBeenCalledTimes(2))
    release()

    await expect(both).resolves.toEqual([
      { kind: 'model-waking', retryAfterSeconds: RETRY_AFTER_SECONDS.asleep },
      { kind: 'model-waking', retryAfterSeconds: RETRY_AFTER_SECONDS.asleep },
    ])
    expect(vm.start).toHaveBeenCalledOnce()
  })

  it('wakes the VM when the answer call itself finds the gateway unreachable', async () => {
    const answer = vi
      .fn<Answerer>()
      .mockResolvedValueOnce(ANSWER)
      .mockRejectedValueOnce(new UpstreamError('unreachable', 'refused'))
    const vm = fakeVm('deallocated')
    const { wrapped } = setup({ vm, answer })

    await wrapped(request)
    await expect(wrapped(request)).resolves.toMatchObject({
      kind: 'model-waking',
    })
    expect(vm.start).toHaveBeenCalledOnce()
  })

  it('passes a timeout through and probes again next time', async () => {
    const answer = vi
      .fn<Answerer>()
      .mockRejectedValueOnce(new UpstreamError('timeout', 'slow'))
      .mockResolvedValue(ANSWER)
    const { wrapped, vm, probe } = setup({ answer })

    await expect(wrapped(request)).rejects.toMatchObject({ kind: 'timeout' })
    expect(vm.getInstanceView).not.toHaveBeenCalled()

    await wrapped(request)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it.each(['rate-limited', 'not-configured', 'failed'] as const)(
    'passes a %s failure through untouched',
    async (kind) => {
      const answer = vi
        .fn<Answerer>()
        .mockRejectedValue(new UpstreamError(kind, 'x'))
      const { wrapped, vm } = setup({ answer })

      await expect(wrapped(request)).rejects.toMatchObject({ kind })
      expect(vm.getInstanceView).not.toHaveBeenCalled()
    },
  )

  it('passes unknown errors through', async () => {
    const answer = vi.fn<Answerer>().mockRejectedValue(new Error('boom'))
    const { wrapped } = setup({ answer })

    await expect(wrapped(request)).rejects.toThrow('boom')
  })

  describe('deadlines', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('gives the probe its own short deadline', async () => {
      const { wrapped, probe } = setup()

      await wrapped(request)
      const signal = probe.mock.calls[0]![0]
      expect(signal.aborted).toBe(false)
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS)
      expect(signal.aborted).toBe(true)
    })

    it('takes the time the probe used out of the answer budget', async () => {
      const harness = setup()
      harness.probe.mockImplementation(async () => {
        harness.advance(1_000)
        return true
      })

      await harness.wrapped(request)
      const signal = harness.answer.mock.calls[0]![1]!.signal!
      vi.advanceTimersByTime(5_999)
      expect(signal.aborted).toBe(false)
      vi.advanceTimersByTime(1)
      expect(signal.aborted).toBe(true)
    })

    it('follows a deadline the caller passes in', async () => {
      const { wrapped, answer } = setup()
      const caller = new AbortController()

      await wrapped(request, { signal: caller.signal })
      caller.abort()

      expect(answer.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    })
  })
})
