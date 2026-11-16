// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ArmError,
  azureVmConfigFromEnv,
  COMPUTE_API_VERSION,
  createVmPowerClient,
  parseInstanceView,
} from './vm-power.ts'
import type { AzureVmConfig } from './vm-power.ts'

const VM_ID =
  '/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/somanami-llm-rg/providers/Microsoft.Compute/virtualMachines/somanami-ollama'
const SECRET = 'super-secret-client-value'
const TOKEN = 'arm-access-token'

const CONFIG: AzureVmConfig = {
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  clientId: 'client-id',
  clientSecret: SECRET,
  vmResourceId: VM_ID,
}

const tokenReply = (expiresIn: number | string = 3599) =>
  Response.json({ access_token: TOKEN, expires_in: expiresIn })

const view = (power: string, time = '2026-11-16T10:00:00Z') =>
  Response.json({
    statuses: [
      { code: 'ProvisioningState/succeeded', time },
      { code: `PowerState/${power}` },
    ],
  })

function fakeFetch(...responses: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response)
    else fetch.mockResolvedValueOnce(response)
  }
  return fetch
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the call to fail')
    },
    (error: unknown) => error as ArmError,
  )

describe('createVmPowerClient', () => {
  it('requests a client-credentials token for ARM, then reads the instance view', async () => {
    const fetch = fakeFetch(tokenReply(), view('deallocated'))
    const client = createVmPowerClient(CONFIG, { fetch })

    await expect(client.getInstanceView()).resolves.toEqual({
      powerState: 'deallocated',
      lastOperationAt: Date.parse('2026-11-16T10:00:00Z'),
    })

    const [tokenUrl, tokenInit] = fetch.mock.calls[0]!
    expect(tokenUrl).toBe(
      `https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/token`,
    )
    expect(tokenInit?.method).toBe('POST')
    const form = new URLSearchParams(String(tokenInit?.body))
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-id',
      client_secret: SECRET,
      scope: 'https://management.azure.com/.default',
    })

    const [viewUrl, viewInit] = fetch.mock.calls[1]!
    expect(viewUrl).toBe(
      `https://management.azure.com${VM_ID}/instanceView?api-version=${COMPUTE_API_VERSION}`,
    )
    expect(viewInit?.method).toBe('GET')
    expect(new Headers(viewInit?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`,
    )
  })

  it('reuses the token until shortly before it expires', async () => {
    let time = 0
    const fetch = fakeFetch(
      tokenReply(3600),
      view('running'),
      view('running'),
      tokenReply(3600),
      view('running'),
    )
    const client = createVmPowerClient(CONFIG, { fetch, now: () => time })

    await client.getInstanceView()
    time = 3_500_000 // 58 min 20 s: still inside the 1-minute margin
    await client.getInstanceView()
    expect(fetch).toHaveBeenCalledTimes(3)

    time = 3_560_000 // past expiry minus the margin
    await client.getInstanceView()
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(String(fetch.mock.calls[3]![0])).toContain('/oauth2/v2.0/token')
  })

  it('shares one token request between concurrent calls', async () => {
    const fetch = fakeFetch(tokenReply(), view('running'), view('starting'))
    const client = createVmPowerClient(CONFIG, { fetch })

    await Promise.all([client.getInstanceView(), client.getInstanceView()])

    const tokenCalls = fetch.mock.calls.filter(([url]) =>
      String(url).includes('/oauth2/'),
    )
    expect(tokenCalls).toHaveLength(1)
  })

  it('accepts expires_in as a string, as Entra sometimes sends it', async () => {
    const fetch = fakeFetch(
      tokenReply('3599'),
      view('running'),
      view('running'),
    )
    const client = createVmPowerClient(CONFIG, { fetch, now: () => 0 })

    await client.getInstanceView()
    await client.getInstanceView()

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('starts the VM with a POST to its start action', async () => {
    const fetch = fakeFetch(tokenReply(), new Response(null, { status: 202 }))
    const client = createVmPowerClient(CONFIG, { fetch })

    await client.start()

    const [url, init] = fetch.mock.calls[1]!
    expect(url).toBe(
      `https://management.azure.com${VM_ID}/start?api-version=${COMPUTE_API_VERSION}`,
    )
    expect(init?.method).toBe('POST')
  })

  it('treats 409 on start as already in progress, so concurrent wakes succeed', async () => {
    const fetch = fakeFetch(tokenReply(), new Response(null, { status: 409 }))

    await expect(
      createVmPowerClient(CONFIG, { fetch }).start(),
    ).resolves.toBeUndefined()
  })

  it.each([
    [400, 'auth'],
    [401, 'auth'],
    [500, 'failed'],
  ] as const)(
    'maps a %i from the token endpoint to %s, without the secret',
    async (status, kind) => {
      const fetch = fakeFetch(
        Response.json(
          { error: 'invalid_client', error_description: `bad ${SECRET}` },
          { status },
        ),
      )
      const error = await failureOf(
        createVmPowerClient(CONFIG, { fetch }).getInstanceView(),
      )

      expect(error).toBeInstanceOf(ArmError)
      expect(error.kind).toBe(kind)
      expect(error.message).not.toContain(SECRET)
      expect(error.message).not.toContain('invalid_client')
    },
  )

  it.each([
    [401, 'auth'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'throttled'],
    [500, 'failed'],
    [409, 'failed'],
  ] as const)('maps ARM %i on instanceView to %s', async (status, kind) => {
    const fetch = fakeFetch(
      tokenReply(),
      Response.json({ error: { message: `token ${TOKEN}` } }, { status }),
    )
    const error = await failureOf(
      createVmPowerClient(CONFIG, { fetch }).getInstanceView(),
    )

    expect(error.kind).toBe(kind)
    expect(error.message).not.toContain(TOKEN)
  })

  it('drops a token ARM rejects, so the next call fetches a new one', async () => {
    const fetch = fakeFetch(
      tokenReply(),
      new Response(null, { status: 401 }),
      tokenReply(),
      view('running'),
    )
    const client = createVmPowerClient(CONFIG, { fetch })

    await failureOf(client.getInstanceView())
    await client.getInstanceView()

    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('reports a network failure as unreachable', async () => {
    const fetch = fakeFetch(new TypeError('fetch failed'))
    const error = await failureOf(
      createVmPowerClient(CONFIG, { fetch }).getInstanceView(),
    )

    expect(error.kind).toBe('unreachable')
  })

  it('reports an aborted call as a timeout and passes the signal through', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => {
      controller.abort()
      expect(init?.signal).toBe(controller.signal)
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })
    const error = await failureOf(
      createVmPowerClient(CONFIG, { fetch }).getInstanceView({
        signal: controller.signal,
      }),
    )

    expect(error.kind).toBe('timeout')
  })

  it('fails when Entra returns no token', async () => {
    const fetch = fakeFetch(Response.json({ expires_in: 3599 }))
    const error = await failureOf(
      createVmPowerClient(CONFIG, { fetch }).getInstanceView(),
    )

    expect(error.kind).toBe('failed')
  })

  it('refuses a resource id that is not a VM', () => {
    expect(() =>
      createVmPowerClient({
        ...CONFIG,
        vmResourceId: '/subscriptions/x/resourceGroups/rg',
      }),
    ).toThrow(TypeError)
  })
})

describe('parseInstanceView', () => {
  it.each([
    'running',
    'starting',
    'stopping',
    'stopped',
    'deallocating',
    'deallocated',
  ])('reads PowerState/%s', (state) => {
    expect(
      parseInstanceView({ statuses: [{ code: `PowerState/${state}` }] })
        .powerState,
    ).toBe(state)
  })

  it('reports unknown for a missing or unfamiliar power state', () => {
    expect(parseInstanceView({ statuses: [] })).toEqual({
      powerState: 'unknown',
      lastOperationAt: null,
    })
    expect(
      parseInstanceView({ statuses: [{ code: 'PowerState/hibernated' }] })
        .powerState,
    ).toBe('unknown')
  })

  it('fails on a body without statuses', () => {
    expect(() => parseInstanceView({})).toThrow(ArmError)
    expect(() => parseInstanceView(null)).toThrow(ArmError)
  })
})

describe('azureVmConfigFromEnv', () => {
  const ENV = {
    AZURE_TENANT_ID: CONFIG.tenantId,
    AZURE_CLIENT_ID: CONFIG.clientId,
    AZURE_CLIENT_SECRET: SECRET,
    AZURE_VM_RESOURCE_ID: VM_ID,
  }

  afterEach(() => vi.restoreAllMocks())

  it('returns the config when all four are set', () => {
    expect(azureVmConfigFromEnv(ENV)).toEqual(CONFIG)
  })

  it('stays silent and disabled when none are set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(azureVmConfigFromEnv({})).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns with the missing names, never the values, when incomplete', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      azureVmConfigFromEnv({
        ...ENV,
        AZURE_CLIENT_ID: ' ',
        AZURE_VM_RESOURCE_ID: '',
      }),
    ).toBeNull()

    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('AZURE_CLIENT_ID, AZURE_VM_RESOURCE_ID')
    expect(message).not.toContain(SECRET)
  })

  it.each([
    '/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg',
    'https://evil.example/x',
    `${VM_ID}/../../other`,
  ])('rejects the resource id %s', (vmResourceId) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      azureVmConfigFromEnv({ ...ENV, AZURE_VM_RESOURCE_ID: vmResourceId }),
    ).toBeNull()
  })

  it('rejects a tenant id that would change the token URL', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      azureVmConfigFromEnv({ ...ENV, AZURE_TENANT_ID: 'x/../evil' }),
    ).toBeNull()
  })
})
