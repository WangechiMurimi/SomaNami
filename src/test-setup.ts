import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Vitest globals are off, so RTL's auto-cleanup doesn't register itself.
afterEach(cleanup)

// Vitest loads .env like Vite does, so a developer's Turnstile key would put a
// security check in front of every auth test. Tests that want one stub it.
beforeEach(() => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})
