import process from 'node:process'
import { createApp } from './app.ts'
import { createAuthenticatorFromEnv } from './auth/verify-access-token.ts'
import { createAnswererFromEnv } from './llm/answerer-from-env.ts'

export const DEFAULT_PORT = 3001

const port = Number(process.env.PORT) || DEFAULT_PORT

// Env: ANTHROPIC_API_KEY for answers, SUPABASE_URL to verify sessions.
// Without SUPABASE_URL every chat is refused as not configured.
createApp({
  answer: createAnswererFromEnv(),
  authenticate: createAuthenticatorFromEnv(),
}).listen(port, () => {
  console.log(`SomaNami API listening on http://localhost:${port}`)
})
