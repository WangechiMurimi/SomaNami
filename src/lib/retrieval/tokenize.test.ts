import { describe, expect, it } from 'vitest'
import { countTerms, isStopword, tokenize } from './tokenize.ts'

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Mitochondria, ATP; and energy!')).toEqual([
      'mitochondria',
      'atp',
      'energy',
    ])
  })

  it('drops stopwords and single characters', () => {
    expect(tokenize('What is the role of a cell?')).toEqual(['role', 'cell'])
  })

  it('keeps possessives as whole words', () => {
    expect(tokenize("the cell's membrane")).toEqual(['cells', 'membrane'])
  })

  it('keeps digits and hyphenated parts as separate terms', () => {
    expect(tokenize('Figure 12 shows a well-known result')).toEqual([
      'figure',
      '12',
      'shows',
      'well',
      'known',
      'result',
    ])
  })

  it('returns an empty list for empty or non-string input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize(undefined)).toEqual([])
    expect(tokenize('   ')).toEqual([])
  })

  it('reports stopwords', () => {
    expect(isStopword('the')).toBe(true)
    expect(isStopword('mitochondria')).toBe(false)
  })
})

describe('countTerms', () => {
  it('counts occurrences per term', () => {
    expect(countTerms(['atp', 'cell', 'atp'])).toEqual(
      new Map([
        ['atp', 2],
        ['cell', 1],
      ]),
    )
  })
})
