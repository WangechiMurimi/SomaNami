// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createApp } from './app.ts'
import type { Authenticate } from './auth/types.ts'
import { LIMITS, parseChatRequest } from './chat/chat-request.ts'
import { handleChat } from './chat/handle-chat.ts'
import { FETCH_LINK_STATUS, handleFetchLink } from './link/handle-fetch-link.ts'
import { LINK_MAX_URL_CHARS } from './link/limits.ts'

// docs/api/openapi.yaml is hand-written, so these checks keep it honest: a
// route added, removed or re-validated without updating the spec fails here
// (#186).

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const functionsDir = join(root, 'netlify', 'functions')

interface Operation {
  responses: Record<string, unknown>
}

interface Spec {
  paths: Record<string, Record<string, Operation>>
  components: {
    schemas: Record<string, { properties?: Record<string, SchemaNode> }>
  }
}

interface SchemaNode {
  enum?: string[]
  properties?: Record<string, SchemaNode>
}

const spec = parse(
  readFileSync(join(root, 'docs', 'api', 'openapi.yaml'), 'utf-8'),
) as Spec

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** `"post /api/chat"` for every operation the spec documents. */
function specOperations(): string[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((key) => (HTTP_METHODS as readonly string[]).includes(key))
      .map((method) => `${method} ${path}`),
  )
}

/** `"post /api/chat"` for every route registered on the Express app. */
function expressOperations(): string[] {
  // Express 5 keeps routes on `app.router.stack`; middleware layers have no
  // `route`, so only real endpoints are listed.
  const { stack } = (
    createApp() as unknown as {
      router: {
        stack: {
          route?: { path: string; methods: Record<string, boolean> }
        }[]
      }
    }
  ).router
  return stack.flatMap(({ route }) =>
    route
      ? Object.keys(route.methods)
          .filter((method) => method !== '_all')
          .map((method) => `${method} ${route.path}`)
      : [],
  )
}

interface NetlifyFunction {
  file: string
  path: string
  handler: (request: Request) => Response | Promise<Response>
}

/** Every Netlify Function entry point, as Netlify would discover it. */
async function netlifyFunctions(): Promise<NetlifyFunction[]> {
  const files = readdirSync(functionsDir).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  )
  return Promise.all(
    files.map(async (file) => {
      const module = (await import(
        pathToFileURL(join(functionsDir, file)).href
      )) as {
        default: NetlifyFunction['handler']
        config: { path: string }
      }
      return { file, path: module.config.path, handler: module.default }
    }),
  )
}

/** Methods a function doesn't refuse with 405, probed without a session. */
async function acceptedMethods(fn: NetlifyFunction): Promise<{
  accepted: string[]
  allow: string | null
}> {
  const accepted: string[] = []
  let allow: string | null = null
  for (const method of HTTP_METHODS) {
    // No Authorization header, so no authenticator ever reaches the network.
    const response = await fn.handler(
      new Request(`http://localhost${fn.path}`, {
        method: method.toUpperCase(),
      }),
    )
    if (response.status === 405) allow = response.headers.get('allow')
    else accepted.push(method)
  }
  return { accepted, allow }
}

// The spec is OpenAPI 3.1, whose schemas are JSON Schema 2020-12. Strict mode
// is off because the document around the schemas has OpenAPI-only keys.
const ajv = new Ajv2020({ allErrors: true, strict: false })
ajv.addSchema({ ...spec, $id: 'https://somanami.invalid/openapi.json' })

/** The validator for `#/components/schemas/<name>`. */
function validator(name: string) {
  const validate = ajv.getSchema(
    `https://somanami.invalid/openapi.json#/components/schemas/${name}`,
  )
  if (!validate) throw new Error(`No schema named ${name} in the spec`)
  return validate
}

const sorted = (values: Iterable<string>) => [...values].sort()

describe('OpenAPI spec routes', () => {
  it('documents exactly the routes registered on the Express app', () => {
    expect(sorted(new Set(expressOperations()))).toEqual(
      sorted(specOperations()),
    )
  })

  it('documents exactly the paths served by Netlify Functions', async () => {
    const functions = await netlifyFunctions()
    expect(sorted(functions.map(({ path }) => path))).toEqual(
      sorted(Object.keys(spec.paths)),
    )
  })

  it('documents only methods each Netlify Function accepts', async () => {
    for (const fn of await netlifyFunctions()) {
      const documented = Object.keys(spec.paths[fn.path] ?? {}).filter((key) =>
        (HTTP_METHODS as readonly string[]).includes(key),
      )
      const { accepted, allow } = await acceptedMethods(fn)
      expect(accepted, fn.file).toEqual(expect.arrayContaining(documented))
      // A function that names its methods must name the documented ones.
      if (allow !== null) {
        expect(sorted(allow.toLowerCase().split(/\s*,\s*/)), fn.file).toEqual(
          sorted(documented),
        )
      }
    }
  })
})

const allow: Authenticate = async () => ({
  ok: true,
  user: { id: 'user-1', aal: 'aal1' },
  accessToken: 'token',
})

const longIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `doc-${index}`)

describe('ChatRequest schema', () => {
  const validate = validator('ChatRequest')

  const samples: [string, unknown][] = [
    ['minimal', { question: 'Why ATP?', materialIds: [] }],
    [
      'with history',
      {
        question: 'And then?',
        materialIds: ['doc-1'],
        history: [
          { role: 'user', content: 'Why ATP?' },
          {
            role: 'assistant',
            content: 'x'.repeat(LIMITS.historyTurnChars * 2),
          },
        ],
      },
    ],
    ['unknown property', { question: 'q', materialIds: [], extra: true }],
    ['duplicate ids', { question: 'q', materialIds: ['doc-1', 'doc-1'] }],
    [
      'longest question',
      { question: 'q'.repeat(LIMITS.questionChars), materialIds: [] },
    ],
    [
      'question too long',
      { question: 'q'.repeat(LIMITS.questionChars + 1), materialIds: [] },
    ],
    ['empty question', { question: '', materialIds: [] }],
    ['blank question', { question: '   ', materialIds: [] }],
    ['question not a string', { question: 1, materialIds: [] }],
    ['no question', { materialIds: [] }],
    ['no materialIds', { question: 'q' }],
    ['materialIds not an array', { question: 'q', materialIds: 'doc-1' }],
    [
      'most materialIds',
      { question: 'q', materialIds: longIds(LIMITS.materialIds) },
    ],
    [
      'too many materialIds',
      { question: 'q', materialIds: longIds(LIMITS.materialIds + 1) },
    ],
    ['empty material id', { question: 'q', materialIds: [''] }],
    [
      'longest material id',
      { question: 'q', materialIds: ['d'.repeat(LIMITS.materialIdChars)] },
    ],
    [
      'material id too long',
      { question: 'q', materialIds: ['d'.repeat(LIMITS.materialIdChars + 1)] },
    ],
    [
      'most history turns',
      {
        question: 'q',
        materialIds: [],
        history: Array.from({ length: LIMITS.historyTurnsAccepted }, () => ({
          role: 'user',
          content: 'hi',
        })),
      },
    ],
    [
      'too many history turns',
      {
        question: 'q',
        materialIds: [],
        history: Array.from(
          { length: LIMITS.historyTurnsAccepted + 1 },
          () => ({ role: 'user', content: 'hi' }),
        ),
      },
    ],
    [
      'unknown role',
      {
        question: 'q',
        materialIds: [],
        history: [{ role: 'system', content: 'hi' }],
      },
    ],
    [
      'turn without content',
      { question: 'q', materialIds: [], history: [{ role: 'user' }] },
    ],
    ['null history', { question: 'q', materialIds: [], history: null }],
    ['null body', null],
    ['array body', []],
    ['string body', 'Why ATP?'],
  ]

  it.each(samples)('agrees with the zod schema: %s', (_name, body) => {
    expect(validate(body), ajv.errorsText(validate.errors)).toBe(
      parseChatRequest(body).ok,
    )
  })
})

describe('FetchLinkRequest schema', () => {
  const validate = validator('FetchLinkRequest')
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    link: {
      bytes: new Uint8Array(),
      contentType: 'text/plain',
      finalUrl: 'https://example.com/',
      fileName: 'example.txt',
    },
  })

  const samples: [string, unknown][] = [
    ['plain url', { url: 'https://example.com/' }],
    ['unknown property', { url: 'https://example.com/', extra: 1 }],
    ['longest url', { url: 'u'.repeat(LINK_MAX_URL_CHARS) }],
    ['url too long', { url: 'u'.repeat(LINK_MAX_URL_CHARS + 1) }],
    ['empty url', { url: '' }],
    ['blank url', { url: '   ' }],
    ['url not a string', { url: 42 }],
    ['no url', {}],
    ['null body', null],
    ['array body', []],
  ]

  it.each(samples)('agrees with the zod schema: %s', async (_name, body) => {
    // The fake fetch succeeds for any URL, so only the body check can fail.
    const result = await handleFetchLink(body, {
      authenticate: allow,
      authorization: 'Bearer token',
      fetch,
    })
    expect(validate(body), ajv.errorsText(validate.errors)).toBe(
      result.status === 200,
    )
  })
})

describe('OpenAPI spec responses', () => {
  it('describes a "not covered" chat reply', async () => {
    const result = await handleChat(
      { question: 'q', materialIds: [] },
      {
        answer: null,
        authenticate: allow,
        authorization: 'Bearer token',
        loadMaterials: null,
      },
    )
    const validate = validator('ChatReply')
    expect(result.status).toBe(200)
    expect(validate(result.body), ajv.errorsText(validate.errors)).toBe(true)
  })

  it('documents every fetch-link error code under its status', () => {
    const responses = spec.paths['/api/fetch-link']?.post?.responses
    const failure = spec.components.schemas.FetchLinkFailure as
      SchemaNode | undefined
    expect(sorted(failure?.properties?.error?.enum ?? [])).toEqual(
      sorted(Object.keys(FETCH_LINK_STATUS)),
    )
    for (const status of Object.values(FETCH_LINK_STATUS)) {
      expect(responses, `status ${status}`).toHaveProperty(String(status))
    }
  })
})
