import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authStorage,
  readKeepSignedIn,
  setKeepSignedIn,
} from './auth-storage.ts'

const KEY = 'sb-demo-auth-token'

const blockStorage = () => {
  for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error('blocked')
    })
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('keep signed in preference', () => {
  it('defaults to staying signed in', () => {
    expect(readKeepSignedIn()).toBe(true)
  })

  it('remembers only the boolean choice', () => {
    setKeepSignedIn(false)
    expect(readKeepSignedIn()).toBe(false)
    expect(Object.keys(window.localStorage)).toEqual([
      'somanami-keep-signed-in',
    ])
    setKeepSignedIn(true)
    expect(readKeepSignedIn()).toBe(true)
  })

  it('falls back to staying signed in when storage is blocked', () => {
    blockStorage()
    expect(() => setKeepSignedIn(false)).not.toThrow()
    expect(readKeepSignedIn()).toBe(true)
  })
})

describe('authStorage', () => {
  it('keeps the session in localStorage when staying signed in', () => {
    setKeepSignedIn(true)
    authStorage.setItem(KEY, 'session')
    expect(window.localStorage.getItem(KEY)).toBe('session')
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(authStorage.getItem(KEY)).toBe('session')
  })

  it('keeps the session in sessionStorage, so it ends with the browser, otherwise', () => {
    setKeepSignedIn(false)
    authStorage.setItem(KEY, 'session')
    expect(window.sessionStorage.getItem(KEY)).toBe('session')
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(authStorage.getItem(KEY)).toBe('session')
  })

  it('leaves no session in the old store when the choice changes', () => {
    setKeepSignedIn(true)
    authStorage.setItem(KEY, 'old')
    setKeepSignedIn(false)
    // A long-lived session must not be read back once the user opted out.
    expect(authStorage.getItem(KEY)).toBeNull()
    authStorage.setItem(KEY, 'new')
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(window.sessionStorage.getItem(KEY)).toBe('new')
  })

  it('removes the session from both stores', () => {
    window.localStorage.setItem(KEY, 'a')
    window.sessionStorage.setItem(KEY, 'b')
    authStorage.removeItem(KEY)
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    blockStorage()
    expect(authStorage.getItem(KEY)).toBeNull()
    expect(() => authStorage.setItem(KEY, 'x')).not.toThrow()
    expect(() => authStorage.removeItem(KEY)).not.toThrow()
  })
})
