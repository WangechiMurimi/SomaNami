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
