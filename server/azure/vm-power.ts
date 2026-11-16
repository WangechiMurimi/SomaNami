import process from 'node:process'

/**
 * A minimal Azure Resource Manager client for one VM: read its power state
 * and start it (#201). It uses `fetch` and the OAuth client-credentials flow
 * rather than the Azure SDK, so the Netlify Functions bundle stays small.
 */

/** Compute API version for `instanceView` and `start`. */
export const COMPUTE_API_VERSION = '2024-07-01'
export const ARM_ORIGIN = 'https://management.azure.com'
export const LOGIN_ORIGIN = 'https://login.microsoftonline.com'
const ARM_SCOPE = `${ARM_ORIGIN}/.default`

// Renew a little before expiry so a token never lapses mid-request.
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/**
 * `/subscriptions/<id>/resourceGroups/<rg>/providers/Microsoft.Compute/virtualMachines/<name>`.
 * Anchored and character-limited, so a stray value can't redirect the call
 * to another ARM path.
 */
const VM_RESOURCE_ID =
  /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[\w.()-]{1,90}\/providers\/Microsoft\.Compute\/virtualMachines\/[\w.-]{1,64}$/i

// Tenant ids are GUIDs; verified domain names are also accepted by Entra.
const TENANT_ID = /^[0-9a-z][0-9a-z.-]{0,253}$/i

export type PowerState =
  | 'running'
  | 'starting'
  | 'stopping'
  | 'stopped'
  | 'deallocating'
  | 'deallocated'
  | 'unknown'

const POWER_STATES: readonly PowerState[] = [
  'running',
  'starting',
  'stopping',
  'stopped',
  'deallocating',
  'deallocated',
]

export interface VmInstanceView {
  powerState: PowerState
  /**
   * When the VM's last operation (such as a start) finished, in epoch ms, or
   * `null` if ARM didn't say. A VM that is running but was started moments
   * ago is still booting its services.
   */
  lastOperationAt: number | null
}

/** Why an ARM call failed, without any credential or response detail. */
export type ArmFailure =
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'throttled'
  | 'unreachable'
  | 'timeout'
  | 'failed'

/** An ARM failure. Messages never contain the secret or a token. */
export class ArmError extends Error {
  readonly kind: ArmFailure

  constructor(kind: ArmFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ArmError'
    this.kind = kind
  }
}

export interface AzureVmConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  /** The VM's full ARM resource id. */
  vmResourceId: string
}

export interface ArmCallOptions {
  /** Aborts the call (token request included); the caller owns the deadline. */
  signal?: AbortSignal
}

export interface VmPowerClient {
  getInstanceView(options?: ArmCallOptions): Promise<VmInstanceView>
  /** Starts the VM. Already starting or busy counts as success. */
  start(options?: ArmCallOptions): Promise<void>
}

export interface VmPowerClientOptions {
  /** Injected in tests; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Injected in tests; defaults to `Date.now`. */
  now?: () => number
}

const ENV_NAMES = {
  tenantId: 'AZURE_TENANT_ID',
  clientId: 'AZURE_CLIENT_ID',
  clientSecret: 'AZURE_CLIENT_SECRET',
  vmResourceId: 'AZURE_VM_RESOURCE_ID',
} as const satisfies Record<keyof AzureVmConfig, string>

/**
 * Reads the waker's settings from server environment variables. Returns
 * `null`, so waking stays off, when none are set; warns (naming variables,
 * never values) when they are incomplete or malformed.
 */
export function azureVmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AzureVmConfig | null {
  const entries = Object.entries(ENV_NAMES) as [keyof AzureVmConfig, string][]
  const values = Object.fromEntries(
    entries.map(([key, name]) => [key, env[name]?.trim() ?? '']),
  ) as unknown as AzureVmConfig
  const missing = entries.filter(([key]) => !values[key]).map(([, n]) => n)

  if (missing.length === entries.length) return null
  if (missing.length > 0) {
    console.warn(
      `Waking the model VM is disabled: ${missing.join(', ')} not set`,
    )
    return null
  }
  if (!VM_RESOURCE_ID.test(values.vmResourceId)) {
    console.warn(
      'Waking the model VM is disabled: AZURE_VM_RESOURCE_ID is not a virtual machine resource id',
    )
    return null
  }
  if (!TENANT_ID.test(values.tenantId)) {
    console.warn('Waking the model VM is disabled: AZURE_TENANT_ID is invalid')
    return null
  }
  return values
}

/** Builds a power client for one VM, caching its ARM token between calls. */
export function createVmPowerClient(
  { tenantId, clientId, clientSecret, vmResourceId }: AzureVmConfig,
  { fetch: fetchImpl = fetch, now = Date.now }: VmPowerClientOptions = {},
): VmPowerClient {
  if (!VM_RESOURCE_ID.test(vmResourceId)) {
    throw new TypeError('vmResourceId is not a virtual machine resource id')
  }
  const tokenUrl = `${LOGIN_ORIGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
  const vmUrl = `${ARM_ORIGIN}${vmResourceId}`

  let cached: { token: string; expiresAt: number } | null = null
  // Concurrent requests on one instance share a single token request.
  let pending: Promise<string> | null = null

  return {
    async getInstanceView(options = {}) {
      const response = await armCall(
        `${vmUrl}/instanceView?api-version=${COMPUTE_API_VERSION}`,
        'GET',
        options,
      )
      return parseInstanceView(await readJson(response, options.signal))
    },

    async start(options = {}) {
      await armCall(
        `${vmUrl}/start?api-version=${COMPUTE_API_VERSION}`,
        'POST',
        options,
        // 409: another operation (a start, or the idle deallocate finishing)
        // is in progress. Starting is idempotent, so the caller treats the VM
        // as waking and checks again on the next request.
        [409],
      )
    },
  }

  async function armCall(
    url: string,
    method: 'GET' | 'POST',
    { signal }: ArmCallOptions,
    tolerated: number[] = [],
  ): Promise<Response> {
    const token = await getToken(signal)
    const response = await send('Azure Resource Manager', url, signal, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.status === 401) cached = null
    if (response.ok || tolerated.includes(response.status)) return response
    // The body is not read: ARM error text can echo request details.
    throw armStatusError(response.status)
  }

  async function getToken(signal?: AbortSignal): Promise<string> {
    if (cached && now() < cached.expiresAt) return cached.token
    pending ??= requestToken(signal).finally(() => {
      pending = null
    })
    return pending
  }

  async function requestToken(signal?: AbortSignal): Promise<string> {
    const response = await send('Microsoft Entra ID', tokenUrl, signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: ARM_SCOPE,
      }),
    })
    if (!response.ok) {
      // 400/401 here mean the tenant, client id or secret is wrong or the
      // secret expired. Entra's error_description is not logged: it can
      // quote the client id and trace ids, and adds nothing actionable.
      if (response.status === 400 || response.status === 401) {
        throw new ArmError(
          'auth',
          `Microsoft Entra ID refused the waker credentials (${response.status})`,
        )
      }
      throw armStatusError(response.status, 'Microsoft Entra ID')
    }
    const payload = await readJson(response, signal)
    const token = (payload as { access_token?: unknown }).access_token
    const expiresIn = Number((payload as { expires_in?: unknown }).expires_in)
    if (typeof token !== 'string' || !token) {
      throw new ArmError('failed', 'Microsoft Entra ID returned no token')
    }
    const lifetimeMs = Number.isFinite(expiresIn) ? expiresIn * 1000 : 0
    cached = {
      token,
      expiresAt: now() + Math.max(0, lifetimeMs - TOKEN_EXPIRY_MARGIN_MS),
    }
    return token
  }

  async function send(
    service: string,
    url: string,
    signal: AbortSignal | undefined,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetchImpl(url, { ...init, signal })
    } catch (error) {
      if (signal?.aborted) {
        throw new ArmError('timeout', `${service} did not answer in time`)
      }
      // The cause is a network error; it carries no request headers.
      throw new ArmError('unreachable', `${service} is unreachable`, {
        cause: error,
      })
    }
  }
}

async function readJson(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    if (signal?.aborted) throw new ArmError('timeout', 'ARM reply timed out')
    throw new ArmError('failed', 'ARM replied with invalid JSON')
  }
}

function armStatusError(
  status: number,
  service = 'Azure Resource Manager',
): ArmError {
  const message = `${service} answered ${status}`
  if (status === 401) return new ArmError('auth', message)
  if (status === 403) return new ArmError('forbidden', message)
  if (status === 404) return new ArmError('not-found', message)
  if (status === 429) return new ArmError('throttled', message)
  return new ArmError('failed', message)
}

/** Reads the power state and last-operation time from an instance view. */
export function parseInstanceView(payload: unknown): VmInstanceView {
  const statuses = (payload as { statuses?: unknown })?.statuses
  if (!Array.isArray(statuses)) {
    throw new ArmError('failed', 'ARM instance view has no statuses')
  }
  let powerState: PowerState = 'unknown'
  let lastOperationAt: number | null = null
  for (const status of statuses as { code?: unknown; time?: unknown }[]) {
    if (typeof status?.code !== 'string') continue
    const [group, value] = status.code.split('/')
    if (group === 'PowerState') {
      powerState = POWER_STATES.find((state) => state === value) ?? 'unknown'
    } else if (
      group === 'ProvisioningState' &&
      typeof status.time === 'string'
    ) {
      const time = Date.parse(status.time)
      lastOperationAt = Number.isNaN(time) ? null : time
    }
  }
  return { powerState, lastOperationAt }
}
