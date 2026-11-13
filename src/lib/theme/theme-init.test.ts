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
  const head = INDEX_HTML.slice(0, INDEX_HTML.indexOf('</head>'))

  it('loads the theme script as a blocking script in <head>', () => {
    // async, defer and type="module" would all run it after first paint.
    expect(head).toMatch(/<script src="\/theme-init\.js"><\/script>/)
  })

  it('has no inline scripts, which the CSP would block', () => {
    const scripts = INDEX_HTML.match(/<script\b[^>]*>/g) ?? []
    for (const tag of scripts) expect(tag).toMatch(/\bsrc=/)
  })
})
