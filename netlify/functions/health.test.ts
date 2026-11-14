// @vitest-environment node
import { describe, expect, it } from 'vitest'
import health, { config } from './health.ts'

describe('health function', () => {
  it('is routed at /api/health', () => {
    expect(config.path).toBe('/api/health')
  })

  it('reports ok without being cached or sniffed', async () => {
    const response = health()

    expect(await response.json()).toEqual({ status: 'ok' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
