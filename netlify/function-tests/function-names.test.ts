import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FUNCTIONS_DIR = new URL('../functions/', import.meta.url)

describe('netlify/functions', () => {
  // Netlify deploys every file in this folder as a function and rejects names
  // with anything but letters, digits, hyphens and underscores, so a stray
  // `*.test.ts` here fails the whole production deploy (#199).
  it('holds only deployable function files', () => {
    const invalid = readdirSync(FUNCTIONS_DIR).filter(
      (name) => !/^[A-Za-z0-9_-]+\.(ts|js|mjs)$/.test(name),
    )
    expect(invalid).toEqual([])
  })
})
