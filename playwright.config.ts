import { defineConfig, devices } from '@playwright/test'
import {
  FAKE_PUBLISHABLE_KEY,
  FAKE_SUPABASE_URL,
} from './tests/e2e/support/fake-backend.ts'

const PORT = 4179
// Outside dist/ so an e2e build, made against a fake project, is never
// mistaken for a real one.
const OUT_DIR = 'node_modules/.cache/e2e-dist'

/**
 * End-to-end tests (#187). The app is built against a fake Supabase project
 * and every request to it, and to /api, is answered by stubs in
 * tests/e2e/support/fake-backend.ts, so no real project or LLM is needed.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Not *.test.* or *.spec.*, so Vitest never collects these.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A production build is steadier than the dev server, which can reload
    // the page mid-test while it optimises dependencies.
    command: `npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a server: one started by hand may point at a real project.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: FAKE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
      // Blank, so the Turnstile widget stays out and reports an empty token.
      // A space, not '': Windows drops empty variables, and then a key in a
      // local .env would load Cloudflare's script.
      VITE_TURNSTILE_SITE_KEY: ' ',
    },
  },
})
