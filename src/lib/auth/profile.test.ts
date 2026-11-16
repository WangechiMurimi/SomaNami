import { afterEach, describe, expect, it } from 'vitest'
import { installFakeSupabase } from '../../features/auth/testing/fake-supabase.ts'
import { getProfile, isProfileComplete, saveProfile } from './profile.ts'
import { setSupabaseClient } from './supabase-client.ts'

afterEach(() => setSupabaseClient(undefined))

describe('getProfile', () => {
  it('maps the row to camelCase', async () => {
    installFakeSupabase({ profile: { display_name: 'Ada', age_13_plus: true } })
    await expect(getProfile('user-1')).resolves.toEqual({
      displayName: 'Ada',
      age13Plus: true,
    })
  })

  it('returns null when no row exists yet', async () => {
    installFakeSupabase({ profile: null })
    await expect(getProfile('user-1')).resolves.toBeNull()
  })

  it('throws when the read fails', async () => {
    const { db } = installFakeSupabase()
    db.readProfile.mockResolvedValueOnce({ data: null, error: new Error('x') })
    await expect(getProfile('user-1')).rejects.toThrow('x')
  })

  it('throws when Supabase is not configured', async () => {
    setSupabaseClient(null)
    await expect(getProfile('user-1')).rejects.toThrow(/not configured/)
  })
})

describe('saveProfile', () => {
  it('upserts the caller’s row with a trimmed name and no timestamps', async () => {
    const { db } = installFakeSupabase({ profile: null })
    await saveProfile('user-1', { displayName: '  Ada  ', age13Plus: true })
    expect(db.upsertProfile).toHaveBeenCalledWith({
      id: 'user-1',
      display_name: 'Ada',
      age_13_plus: true,
    })
    await expect(getProfile('user-1')).resolves.toEqual({
      displayName: 'Ada',
      age13Plus: true,
    })
  })

  it('throws when the write fails', async () => {
    const { db } = installFakeSupabase()
    db.upsertProfile.mockResolvedValueOnce({ error: new Error('denied') })
    await expect(
      saveProfile('user-1', { displayName: 'Ada', age13Plus: true }),
    ).rejects.toThrow('denied')
  })
})

describe('isProfileComplete', () => {
  it.each([
    [null, false],
    [{ displayName: null, age13Plus: true }, false],
    [{ displayName: '   ', age13Plus: true }, false],
    [{ displayName: 'Ada', age13Plus: false }, false],
    [{ displayName: 'Ada', age13Plus: true }, true],
  ])('%j is complete: %s', (profile, expected) => {
    expect(isProfileComplete(profile)).toBe(expected)
  })
})
