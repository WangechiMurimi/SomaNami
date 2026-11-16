import { describe, expect, it } from 'vitest'
import { batches } from './batches.ts'

describe('batches', () => {
  it('splits into slices of the given size, keeping the remainder', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns no slices for no items', () => {
    expect(batches([], 3)).toEqual([])
  })
})
