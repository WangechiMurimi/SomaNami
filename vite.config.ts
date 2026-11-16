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

const CRITICAL_LOGIC_THRESHOLD = {
  lines: 80,
  statements: 80,
  functions: 80,
  branches: 80,
}

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
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Measure our own source only, so untested files still count as 0%
      // instead of disappearing from the report.
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'netlify/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/testing/**',
        'src/test-setup.ts',
        'src/lib/storage/test-adapters.ts',
        '**/*.d.ts',
        // Type-only contracts: nothing to execute.
        'src/types/**',
        'server/auth/types.ts',
        'src/features/upload/parsed-file.ts',
        'src/lib/storage/adapter.ts',
        'src/lib/sync/cloud.ts',
        // Re-export barrel.
        'src/lib/retrieval/index.ts',
        // Entry points that only wire things together and start the app.
        'src/main.tsx',
        'server/server.ts',
      ],
      // AGENTS.md asks for 80% on critical application logic: the API, the
      // Netlify adapters, shared libraries and the features' non-UI modules
      // (hooks, parsers, clients). Screens and components carry no bar.
      // Each glob is measured as a whole, not file by file.
      thresholds: {
        'server/**': CRITICAL_LOGIC_THRESHOLD,
        'netlify/**': CRITICAL_LOGIC_THRESHOLD,
        // Sync is held apart so its gap can't hide inside src/lib's average.
        'src/lib/!(sync)/**': CRITICAL_LOGIC_THRESHOLD,
        'src/features/**/*.ts': CRITICAL_LOGIC_THRESHOLD,
        // TODO(#189): supabase-cloud.ts is only exercised by
        // supabase-cloud.integration.test.ts, which skips without a local
        // Supabase stack. This is today's floor so it can't slip further;
        // raise it to 80 once coverage runs with the stack in CI.
        'src/lib/sync/**': {
          lines: 60,
          statements: 57,
          functions: 60,
          branches: 48,
        },
      },
    },
    alias: [
      // Vitest resolves packages like Node, which picks mammoth's Node build
      // (no `arrayBuffer` input). Use the browser build the app ships with.
      { find: /^mammoth$/, replacement: 'mammoth/mammoth.browser.js' },
    ],
  },
})
