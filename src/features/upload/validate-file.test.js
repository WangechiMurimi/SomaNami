import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES } from './constants.js'
import { validateFile } from './validate-file.js'

const fileOf = (name, size = 10) => ({ name, size })

describe('validateFile', () => {
  it.each([
    ['notes.pdf', 'pdf'],
    ['NOTES.PDF', 'pdf'],
    ['notes.txt', 'text'],
    ['readme.md', 'text'],
  ])('accepts %s', (name, kind) => {
    expect(validateFile(fileOf(name))).toEqual({ ok: true, kind })
  })

  it('names planned formats instead of calling them invalid', () => {
    const result = validateFile(fileOf('slides.pptx'))
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('unsupported-planned')
    expect(result.error.message).toContain('.pptx')
  })

  it.each(['image.png', 'no-extension'])('rejects %s', (name) => {
    expect(validateFile(fileOf(name)).error.code).toBe('unsupported-type')
  })

  it('rejects empty files', () => {
    expect(validateFile(fileOf('a.txt', 0)).error.code).toBe('empty')
  })

  it('allows exactly the size limit and rejects one byte over', () => {
    expect(validateFile(fileOf('a.pdf', MAX_FILE_BYTES)).ok).toBe(true)
    expect(validateFile(fileOf('a.pdf', MAX_FILE_BYTES + 1)).error.code).toBe(
      'too-large',
    )
  })
})
