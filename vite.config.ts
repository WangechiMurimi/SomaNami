import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Gitignored local copies that tools would otherwise scan: Claude Code
 * agent worktrees (whole checkouts of the repo) and Python virtualenvs.
 * Vitest and ESLint don't read .gitignore, so both list these.
 */
const LOCAL_ONLY_DIRS = ['.claude/worktrees/**', '**/.venv/**']

/**
 * Kept out of Vitest only. Nothing under .claude/ is ours to test, and
 * tests/e2e/ holds Playwright specs, which Vitest can't run.
 */
const NOT_VITEST_DIRS = ['.claude/**', 'tests/e2e/**']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the API runs separately (`npm run server:dev`); in
    // production Netlify routes /api/* to Functions on the same origin.
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
    exclude: [
      ...configDefaults.exclude,
      ...LOCAL_ONLY_DIRS,
      ...NOT_VITEST_DIRS,
    ],
    alias: [
      // Vitest resolves packages like Node, which picks mammoth's Node build
      // (no `arrayBuffer` input). Use the browser build the app ships with.
      { find: /^mammoth$/, replacement: 'mammoth/mammoth.browser.js' },
    ],
  },
})
