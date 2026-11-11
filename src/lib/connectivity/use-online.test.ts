import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnline } from './use-online.ts'

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

afterEach(() => vi.restoreAllMocks())

describe('useOnline', () => {
  it('reports the current connection state', () => {
    setOnline(false)

    const { result } = renderHook(() => useOnline())

    expect(result.current).toBe(false)
  })

  it('updates when the browser goes offline and back online', () => {
    setOnline(true)
    const { result } = renderHook(() => useOnline())

    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
