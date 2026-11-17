/**
 * Reads a Fetch API request body as UTF-8, or `null` as soon as it passes
 * `limit` bytes. Shared by the Netlify Functions, which get no body parser.
 */
export async function readCapped(
  request: Request,
  limit: number,
): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > limit) {
      // Stop pulling the rest of an oversized upload.
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export type JsonBody =
  | { ok: true; body: unknown }
  | { ok: false; problem: 'too-large' | 'invalid-json' }

/**
 * Reads a request body capped at `limit` bytes and parses it as JSON. Each
 * Function maps the problems to its own error codes.
 */
export async function readJsonBody(
  request: Request,
  limit: number,
): Promise<JsonBody> {
  // A declared length is free to check; readCapped still enforces the cap for
  // bodies that lie about it or stream without one.
  const declared = Number(request.headers.get('content-length'))
  if (declared > limit) return { ok: false, problem: 'too-large' }

  const text = await readCapped(request, limit)
  if (text === null) return { ok: false, problem: 'too-large' }

  try {
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: false, problem: 'invalid-json' }
  }
}
