import { handleChat } from '../../server/chat/handle-chat.ts'
import { createAnswererFromEnv } from '../../server/llm/answerer-from-env.ts'

// Built once per function instance and reused across invocations.
const answer = createAnswererFromEnv()

/** Netlify Function serving `POST /api/chat` in production. */
export default async function chat(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method-not-allowed' },
      { status: 405, headers: { Allow: 'POST' } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid-json' }, { status: 400 })
  }

  const result = await handleChat(body, { answer })
  return Response.json(result.body, { status: result.status })
}

export const config = { path: '/api/chat' }
