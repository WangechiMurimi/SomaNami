// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildMessages, renderPassages, SYSTEM_PROMPT } from './prompt.ts'

const passage = {
  documentId: 'doc-1',
  chunkId: 'doc-1:0',
  text: 'Mitochondria produce ATP.',
  source: { type: 'page' as const, page: 1 },
}

describe('SYSTEM_PROMPT', () => {
  it('tells the model earlier turns are not evidence', () => {
    expect(SYSTEM_PROMPT).toMatch(/not evidence/)
  })

  it('contains no per-request content, so it can be cached', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/<passage|<question/)
  })
})

describe('renderPassages', () => {
  it('labels each passage with its chunk id', () => {
    expect(renderPassages([passage])).toBe(
      '<passages>\n<passage id="doc-1:0">\nMitochondria produce ATP.\n</passage>\n</passages>',
    )
  })

  it('escapes quotes in ids so they cannot break out of the attribute', () => {
    expect(renderPassages([{ ...passage, chunkId: 'a"b' }])).toContain(
      'id="a&quot;b"',
    )
  })

  it('renders an empty marker when there are no passages', () => {
    expect(renderPassages([])).toBe('<passages />')
  })
})

describe('buildMessages', () => {
  it('ends with the passages and the question in one user turn', () => {
    const messages = buildMessages({
      question: 'Why ATP?',
      passages: [passage],
      history: [],
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content).toContain('<question>\nWhy ATP?\n</question>')
    expect(messages[0]?.content).toContain('<passage id="doc-1:0">')
  })

  it('keeps earlier turns, in order, before the current question', () => {
    const messages = buildMessages({
      question: 'And the second one?',
      passages: [passage],
      history: [
        { role: 'user', content: 'Name two organelles.' },
        { role: 'assistant', content: 'Mitochondria and ribosomes.' },
      ],
    })

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[1]?.content).toBe('Mitochondria and ribosomes.')
  })

  it('drops leading assistant turns, since the API must start with the user', () => {
    const messages = buildMessages({
      question: 'Why?',
      passages: [],
      history: [{ role: 'assistant', content: 'Hello! Ask me anything.' }],
    })

    expect(messages.map((m) => m.role)).toEqual(['user'])
  })
})
