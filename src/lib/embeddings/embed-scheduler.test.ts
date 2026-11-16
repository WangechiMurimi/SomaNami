import { describe, expect, it, vi } from 'vitest'
import type { EmbedReply } from '../../types/contracts.ts'
import { createEmbedScheduler } from './embed-scheduler.ts'
import { EmbedRequestError } from './request-embeddings.ts'

const replies = (...values: (EmbedReply | Error)[]) => {
  const request = vi.fn<() => Promise<EmbedReply>>()
  for (const value of values) {
    if (value instanceof Error) request.mockRejectedValueOnce(value)
    else request.mockResolvedValueOnce(value)
  }
  return request
}

const page = (done: boolean): EmbedReply => ({ embedded: 32, done })
const serverDown = () =>
  new EmbedRequestError('down', { code: 'upstream-failed', status: 502 })

describe('createEmbedScheduler', () => {
  it('runs on its first kick, so chunks left over from earlier get embedded', async () => {
    const request = replies({ embedded: 0, done: true })
    const scheduler = createEmbedScheduler({ request })

    await scheduler.kick()

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps asking until the server says done', async () => {
    const request = replies(page(false), page(false), page(true))
    const scheduler = createEmbedScheduler({ request })

    await scheduler.kick()

    expect(request).toHaveBeenCalledTimes(3)
  })

  it('does nothing on later kicks until marked as needed', async () => {
    const request = replies(page(true), page(true))
    const scheduler = createEmbedScheduler({ request })
    await scheduler.kick()

    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(1)

    scheduler.markNeeded()
    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('never runs two at once', async () => {
    let release: (reply: EmbedReply) => void = () => {}
    const request = vi.fn(
      () =>
        new Promise<EmbedReply>((resolve) => {
          release = resolve
        }),
    )
    const scheduler = createEmbedScheduler({ request })

    const first = scheduler.kick()
    const second = scheduler.kick()
    release(page(true))
    await Promise.all([first, second])

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('never rejects, so callers can fire and forget', async () => {
    const scheduler = createEmbedScheduler({ request: replies(serverDown()) })

    await expect(scheduler.kick()).resolves.toBeUndefined()
  })

  it('retries after a failure, once the backoff has passed', async () => {
    let clock = 0
    const request = replies(serverDown(), page(true))
    const scheduler = createEmbedScheduler({
      request,
      now: () => clock,
      retryAfterMs: 1_000,
    })

    await scheduler.kick()
    clock = 999
    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(1)

    clock = 1_000
    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('doubles the backoff after each failure, up to a cap', async () => {
    let clock = 0
    const request = replies(
      serverDown(),
      serverDown(),
      serverDown(),
      page(true),
    )
    const scheduler = createEmbedScheduler({
      request,
      now: () => clock,
      retryAfterMs: 1_000,
      maxRetryAfterMs: 1_500,
    })

    await scheduler.kick() // fails: wait 1,000
    clock = 1_000
    await scheduler.kick() // fails: wait 1,500 (2,000 capped)
    clock = 2_400
    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(2)

    clock = 2_500
    await scheduler.kick() // fails again
    clock = 4_000
    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('resets the backoff after a success', async () => {
    let clock = 0
    const request = replies(serverDown(), page(true), serverDown(), page(true))
    const scheduler = createEmbedScheduler({
      request,
      now: () => clock,
      retryAfterMs: 1_000,
    })

    await scheduler.kick()
    clock = 1_000
    await scheduler.kick() // succeeds
    scheduler.markNeeded()
    await scheduler.kick() // fails: back to 1,000, not 2,000
    clock = 2_000
    await scheduler.kick()

    expect(request).toHaveBeenCalledTimes(4)
  })

  it('stops a run that makes no progress instead of looping', async () => {
    const request = vi.fn(async () => ({ embedded: 0, done: false }))
    const scheduler = createEmbedScheduler({ request })

    await scheduler.kick()

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('pauses a long run after its round limit and resumes on the next kick', async () => {
    const request = vi.fn(async () => page(false))
    const scheduler = createEmbedScheduler({ request, maxRounds: 3 })

    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(3)

    await scheduler.kick()
    expect(request).toHaveBeenCalledTimes(6)
  })
})
