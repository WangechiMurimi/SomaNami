import { describe, expect, it } from 'vitest'
import { qrImageSrc } from './qr-src.ts'

describe('qrImageSrc', () => {
  it('encodes raw SVG so a # cannot end the URI', () => {
    const src = qrImageSrc(
      'data:image/svg+xml;utf-8,<svg><rect fill="#000"/></svg>',
    )
    expect(src).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg><rect fill="#000"/></svg>')}`,
    )
    expect(src).not.toContain('#')
  })

  it('leaves an already-encoded or base64 URI alone', () => {
    const encoded = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E'
    const base64 = 'data:image/svg+xml;base64,PHN2Zy8+'
    expect(qrImageSrc(encoded)).toBe(encoded)
    expect(qrImageSrc(base64)).toBe(base64)
  })
})
