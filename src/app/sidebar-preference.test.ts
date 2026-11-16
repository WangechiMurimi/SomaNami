import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readSidebarCollapsed,
  SIDEBAR_KEY,
  useSidebarCollapsed,
} from './sidebar-preference.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useSidebarCollapsed', () => {
  it('starts expanded when nothing was saved', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current[0]).toBe(false)
  })

  it('remembers a collapsed sidebar for the next session', () => {
    const first = renderHook(() => useSidebarCollapsed())
    act(() => first.result.current[1](true))
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('collapsed')
    first.unmount()

    const next = renderHook(() => useSidebarCollapsed())
    expect(next.result.current[0]).toBe(true)

    act(() => next.result.current[1](false))
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull()
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readSidebarCollapsed()).toBe(false)

    const { result } = renderHook(() => useSidebarCollapsed())
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
  })
})
