import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from './use-theme'

// The script lives in public/ so it ships as a same-origin file the CSP can
// allow without 'unsafe-inline'. It is plain JS run before React, so the test
// executes the real file rather than importing it. The test sits here, beside
// use-theme.ts, because anything in public/ is copied into the build.
const ROOT = resolve(__dirname, '../../..')
const SCRIPT = readFileSync(resolve(ROOT, 'public/theme-init.js'), 'utf8')
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
// Taken before any test runs the script, so a leak from an earlier test counts.
const GLOBALS_BEFORE = new Set(Object.keys(globalThis))

// Indirect eval runs at global scope, as a classic <script> does, so a stray
// top-level var would show up as a global.
function runThemeInit(): void {
  ;(0, eval)(SCRIPT)
}

function mockSystemTheme(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: dark && query === '(prefers-color-scheme: dark)',
      media: query,
    })),
  )
}

describe('public/theme-init.js', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the same storage key as useTheme', () => {
    expect(SCRIPT).toContain(`'${THEME_KEY}'`)
  })

  describe.each([
    ['light system', false],
    ['dark system', true],
  ])('with a %s', (_label, systemDark) => {
    beforeEach(() => mockSystemTheme(systemDark))

    it.each(['light', 'dark'] as const)('applies a saved %s theme', (saved) => {
      localStorage.setItem(THEME_KEY, saved)
      runThemeInit()
      expect(document.documentElement.dataset.theme).toBe(saved)
    })

    // With no saved choice, the CSS prefers-color-scheme rule picks the theme,
    // so the script must leave <html> alone rather than pin one.
    it('leaves the theme unset when nothing is saved', () => {
      runThemeInit()
      expect(document.documentElement.dataset.theme).toBeUndefined()
    })

    it('ignores an unrecognised saved value', () => {
      localStorage.setItem(THEME_KEY, 'sepia')
      runThemeInit()
      expect(document.documentElement.dataset.theme).toBeUndefined()
    })
  })

  it('leaves no globals behind', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    runThemeInit()
    const added = Object.keys(globalThis).filter((k) => !GLOBALS_BEFORE.has(k))
    expect(added).toEqual([])
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(runThemeInit).not.toThrow()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe('index.html', () => {
  // Parse rather than pattern-match: regexes miss valid HTML variants.
  const page = new DOMParser().parseFromString(INDEX_HTML, 'text/html')

  it('loads the theme script first, as a blocking script in <head>', () => {
    const first = page.head.querySelector('script')
    expect(first?.getAttribute('src')).toBe('/theme-init.js')
    // async, defer and type="module" would all run it after first paint.
    expect(first?.hasAttribute('async')).toBe(false)
    expect(first?.hasAttribute('defer')).toBe(false)
    expect(first?.getAttribute('type')).not.toBe('module')
  })

  it('has no inline scripts, which the CSP would block', () => {
    const scripts = [...page.querySelectorAll('script')]
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) expect(script.hasAttribute('src')).toBe(true)
  })
})
