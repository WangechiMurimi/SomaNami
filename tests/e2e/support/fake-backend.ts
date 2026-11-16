import type { Page, Request, Route } from '@playwright/test'

/**
 * The Supabase project the app is built against during e2e runs (see
 * playwright.config.ts). Nothing listens there: every request to it is
 * answered by the stubs below, so the suite never reaches a real project.
 */
export const FAKE_SUPABASE_URL = 'http://supabase.e2e.test'
export const FAKE_PUBLISHABLE_KEY = 'sb_publishable_e2e'

/** The one account the fake Auth server knows. */
export const LEARNER = {
  id: '00000000-0000-4000-8000-0000000000e2',
  email: 'learner@example.com',
  password: 'correct horse battery staple',
  displayName: 'Ada',
}

export const CANNED_ANSWER =
  'Chlorophyll absorbs mostly red and blue light, so the green light is reflected.'

/** What a stubbed `/api/chat` call carried, for assertions. */
export interface ChatCall {
  question: string
  materialIds: string[]
  authorization: string | undefined
}

/** A storage upload the app made, for assertions. */
export interface StorageUpload {
  path: string
  authorization: string | undefined
}

export interface FakeBackend {
  chatCalls: ChatCall[]
  uploads: StorageUpload[]
  /** Requests no stub recognised; a test should end with none. */
  unexpected: string[]
}

const base64Url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * A structurally valid but unsigned JWT: supabase-js decodes the payload (for
 * `exp` and claims) but never verifies the signature in the browser.
 */
function fakeAccessToken(expiresAt: number): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' })
  const payload = base64Url({
    sub: LEARNER.id,
    email: LEARNER.email,
    aud: 'authenticated',
    role: 'authenticated',
    exp: expiresAt,
    iat: expiresAt - 3600,
  })
  return `${header}.${payload}.e2e-signature`
}

const user = () => ({
  id: LEARNER.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: LEARNER.email,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

/** The body GoTrue returns from `POST /auth/v1/token`. */
function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: fakeAccessToken(expiresAt),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'e2e-refresh-token',
    user: user(),
  }
}

// The fake project is on another origin, so the browser still checks CORS.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

function handleAuth(route: Route, request: Request, path: string) {
  if (path === '/auth/v1/token' && request.method() === 'POST') {
    const grant = new URL(request.url()).searchParams.get('grant_type')
    if (grant === 'refresh_token') return json(route, session())
    const body = request.postDataJSON() as { email?: string; password?: string }
    if (body.email === LEARNER.email && body.password === LEARNER.password) {
      return json(route, session())
    }
    return json(
      route,
      {
        code: 400,
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials',
      },
      400,
    )
  }
  if (path === '/auth/v1/user' && request.method() === 'GET') {
    return json(route, user())
  }
  if (path === '/auth/v1/logout') {
    return route.fulfill({ status: 204, headers: CORS })
  }
  return null
}

/**
 * PostgREST, just enough for the profile gate and background sync: reads
 * return nothing new (except the learner's complete profile), and writes echo
 * their rows back as written, which is what a successful upsert returns.
 */
function handleRest(route: Route, request: Request, path: string) {
  const method = request.method()
  if (method === 'GET') {
    if (path === '/rest/v1/profiles') {
      return json(route, [
        { display_name: LEARNER.displayName, age_13_plus: true },
      ])
    }
    return json(route, [])
  }
  if (method === 'POST' || method === 'PATCH') {
    const body: unknown = request.postDataJSON()
    return json(route, Array.isArray(body) ? body : [body], 201)
  }
  if (method === 'DELETE') return json(route, [])
  return null
}

/** Supabase Storage: uploads to the `materials` bucket, listings and removals. */
function handleStorage(
  route: Route,
  request: Request,
  path: string,
  backend: FakeBackend,
) {
  const method = request.method()
  const upload = path.match(/^\/storage\/v1\/object\/materials\/(.+)$/)
  if (upload && (method === 'POST' || method === 'PUT')) {
    const objectPath = decodeURIComponent(upload[1]!)
    backend.uploads.push({
      path: objectPath,
      authorization: request.headers()['authorization'],
    })
    return json(route, { Id: 'e2e-object', Key: `materials/${objectPath}` })
  }
  if (path === '/storage/v1/object/list/materials' && method === 'POST') {
    return json(route, [])
  }
  if (path === '/storage/v1/object/materials' && method === 'DELETE') {
    return json(route, [])
  }
  return null
}

/**
 * The reply `POST /api/chat` sends (`ChatReply`), citing the first passage of
 * the first material it was asked about.
 */
function chatReply(materialIds: string[]) {
  const documentId = materialIds[0] ?? 'missing'
  const chunkId = `${documentId}:0`
  return {
    answer: CANNED_ANSWER,
    answerable: true,
    citations: [{ documentId, chunkId }],
    passages: [
      {
        documentId,
        chunkId,
        documentName: 'photosynthesis.txt',
        text: 'Chlorophyll in the chloroplasts absorbs mostly red and blue light, which is why leaves look green.',
        source: { type: 'line', startLine: 4, endLine: 4 },
      },
    ],
  }
}

/**
 * Answers every request the app makes to Supabase and to our own API, so a
 * test needs neither a Supabase project nor an LLM key. Anything unrecognised
 * gets a 501 and is recorded in `unexpected`, which surfaces drift between
 * these stubs and what the app actually calls.
 */
export async function installFakeBackend(page: Page): Promise<FakeBackend> {
  const backend: FakeBackend = { chatCalls: [], uploads: [], unexpected: [] }

  await page.route(`${FAKE_SUPABASE_URL}/**`, async (route, request) => {
    if (request.method() === 'OPTIONS') {
      // A wildcard doesn't cover `Authorization`, so echo what was asked for.
      const asked = request.headers()['access-control-request-headers'] ?? '*'
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'access-control-allow-headers': asked },
      })
    }
    const path = new URL(request.url()).pathname
    const handled = path.startsWith('/auth/v1/')
      ? handleAuth(route, request, path)
      : path.startsWith('/rest/v1/')
        ? handleRest(route, request, path)
        : path.startsWith('/storage/v1/')
          ? handleStorage(route, request, path, backend)
          : null
    if (handled) return handled
    backend.unexpected.push(`${request.method()} ${path}`)
    return json(route, { message: 'Not stubbed in e2e' }, 501)
  })

  await page.route('**/api/**', async (route, request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/chat' && request.method() === 'POST') {
      const body = request.postDataJSON() as ChatCall
      backend.chatCalls.push({
        question: body.question,
        materialIds: body.materialIds,
        authorization: request.headers()['authorization'],
      })
      return json(route, chatReply(body.materialIds))
    }
    backend.unexpected.push(`${request.method()} ${path}`)
    return json(route, { error: 'not-stubbed' }, 501)
  })

  // Web fonts only change how text looks; skipping them keeps runs offline.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  )

  return backend
}
