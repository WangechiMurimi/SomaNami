import process from 'node:process'
import { createApp } from './app.ts'
import { createAuthenticatorFromEnv } from './auth/verify-access-token.ts'
import { createMaterialsLoaderFromEnv } from './chat/load-materials.ts'
import { createChunkStoreFromEnv } from './embed/chunk-store.ts'
import { createAnswererFromEnv } from './llm/answerer-from-env.ts'
import { createEmbedderFromEnv } from './llm/ollama-embedder.ts'

export const DEFAULT_PORT = 3001

const port = Number(process.env.PORT) || DEFAULT_PORT

// Env: ANTHROPIC_API_KEY for answers, SUPABASE_URL to verify sessions, and
// SUPABASE_PUBLISHABLE_KEY to load materials as the user (both fall back to
// their VITE_* names). Without SUPABASE_URL every chat and link fetch is
// refused as not configured; chat also needs SUPABASE_PUBLISHABLE_KEY.
// Embeddings need OLLAMA_BASE_URL (plus OLLAMA_API_KEY behind the gateway).
createApp({
  answer: createAnswererFromEnv(),
  authenticate: createAuthenticatorFromEnv(),
  chunks: createChunkStoreFromEnv(),
  embed: createEmbedderFromEnv(),
  loadMaterials: createMaterialsLoaderFromEnv(),
}).listen(port, () => {
  console.log(`SomaNami API listening on http://localhost:${port}`)
})
