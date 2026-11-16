import { describe, expect, it } from 'vitest'
import { count } from './count.ts'

describe('count', () => {
  it('uses the singular for exactly one', () => {
    expect(count(1, 'chat', 'chats')).toBe('1 chat')
  })

  it('uses the plural for zero and for more than one', () => {
    expect(count(0, 'source', 'sources')).toBe('0 sources')
    expect(count(3, 'source', 'sources')).toBe('3 sources')
  })
})
