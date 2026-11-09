import process from 'node:process'
import { createApp } from './app.ts'
import { createAnswererFromEnv } from './llm/answerer-from-env.ts'

export const DEFAULT_PORT = 3001

const port = Number(process.env.PORT) || DEFAULT_PORT

createApp({ answer: createAnswererFromEnv() }).listen(port, () => {
  console.log(`SomaNami API listening on http://localhost:${port}`)
})
