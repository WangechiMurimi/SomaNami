import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    globals: false,
    alias: [
      // Vitest resolves packages like Node, which picks mammoth's Node build
      // (no `arrayBuffer` input). Use the browser build the app ships with.
      { find: /^mammoth$/, replacement: 'mammoth/mammoth.browser.js' },
    ],
  },
})
