import process from 'node:process'
import { createApp } from './app.ts'
import { createAuthenticatorFromEnv } from './auth/verify-access-token.ts'
import { createMaterialsLoaderFromEnv } from './chat/load-materials.ts'
import { createAnswererFromEnv } from './llm/answerer-from-env.ts'

export const DEFAULT_PORT = 3001

const port = Number(process.env.PORT) || DEFAULT_PORT

// Env: ANTHROPIC_API_KEY for answers, SUPABASE_URL to verify sessions, and
// SUPABASE_PUBLISHABLE_KEY to load materials as the user (both fall back to
// their VITE_* names). Without them every chat is refused as not configured.
createApp({
  answer: createAnswererFromEnv(),
  authenticate: createAuthenticatorFromEnv(),
  loadMaterials: createMaterialsLoaderFromEnv(),
}).listen(port, () => {
  console.log(`SomaNami API listening on http://localhost:${port}`)
})
