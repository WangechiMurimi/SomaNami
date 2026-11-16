// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnswererFromEnv } from './answerer-from-env.ts'
import { createClaudeAnswerer } from './claude-answerer.ts'
import { createOllamaAnswerer, createOllamaProbe } from './ollama-answerer.ts'
import { withVmWake } from './vm-wake.ts'

vi.mock('./claude-answerer.ts', () => ({
  createClaudeAnswerer: vi.fn(() => async () => ({ kind: 'refusal' })),
}))
vi.mock('./ollama-answerer.ts', () => ({
  createOllamaAnswerer: vi.fn(() => async () => ({ kind: 'refusal' })),
  createOllamaProbe: vi.fn(() => async () => true),
  DEFAULT_OLLAMA_TIMEOUT_MS: 7000,
}))
vi.mock('./vm-wake.ts', () => ({
  withVmWake: vi.fn(() => async () => ({ kind: 'refusal' })),
}))

const claude = vi.mocked(createClaudeAnswerer)
const ollama = vi.mocked(createOllamaAnswerer)
const probe = vi.mocked(createOllamaProbe)
const wake = vi.mocked(withVmWake)

const AZURE = {
  AZURE_TENANT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  AZURE_CLIENT_ID: 'client-id',
  AZURE_CLIENT_SECRET: 'client-secret',
  AZURE_VM_RESOURCE_ID:
    '/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/somanami-llm-rg/providers/Microsoft.Compute/virtualMachines/somanami-ollama',
}

describe('createAnswererFromEnv', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns null when nothing is configured, so the route can say so', () => {
    expect(createAnswererFromEnv({})).toBeNull()
    expect(ollama).not.toHaveBeenCalled()
    expect(claude).not.toHaveBeenCalled()
  })

  describe('ollama (the default)', () => {
    it('is chosen when LLM_PROVIDER is unset', () => {
      const answerer = createAnswererFromEnv({
        OLLAMA_BASE_URL: 'http://localhost:11434',
        ANTHROPIC_API_KEY: 'ignored',
      })

      expect(answerer).toBeTypeOf('function')
      expect(ollama).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:11434',
        apiKey: undefined,
        model: undefined,
        timeoutMs: undefined,
      })
      expect(claude).not.toHaveBeenCalled()
    })

    it('passes the key, model and timeout through', () => {
      createAnswererFromEnv({
        LLM_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: 'https://llm.example',
        OLLAMA_API_KEY: 'k',
        OLLAMA_MODEL: 'llama3',
        OLLAMA_TIMEOUT_MS: '7000',
      })

      expect(ollama).toHaveBeenCalledWith({
        baseUrl: 'https://llm.example',
        apiKey: 'k',
        model: 'llama3',
        timeoutMs: 7000,
      })
    })

    it.each(['', 'soon', '-1', '0', '1.5'])(
      'ignores an invalid OLLAMA_TIMEOUT_MS of "%s"',
      (value) => {
        createAnswererFromEnv({
          OLLAMA_BASE_URL: 'http://localhost:11434',
          OLLAMA_TIMEOUT_MS: value,
        })

        expect(ollama.mock.calls[0]?.[0].timeoutMs).toBeUndefined()
      },
    )

    it('does not wrap the answerer in a waker without the AZURE_* settings', () => {
      createAnswererFromEnv({ OLLAMA_BASE_URL: 'http://localhost:11434' })

      expect(wake).not.toHaveBeenCalled()
    })

    it('wakes the VM on request when all AZURE_* settings are present (#201)', () => {
      const answerer = createAnswererFromEnv({
        OLLAMA_BASE_URL: 'https://llm.example',
        OLLAMA_API_KEY: 'k',
        OLLAMA_TIMEOUT_MS: '6500',
        ...AZURE,
      })

      expect(answerer).toBeTypeOf('function')
      expect(probe).toHaveBeenCalledWith({
        baseUrl: 'https://llm.example',
        apiKey: 'k',
      })
      expect(wake).toHaveBeenCalledWith(ollama.mock.results[0]?.value, {
        vm: expect.objectContaining({
          getInstanceView: expect.any(Function),
          start: expect.any(Function),
        }),
        probe: probe.mock.results[0]?.value,
        answerTimeoutMs: 6500,
      })
    })

    it('keeps waking off when the AZURE_* settings are incomplete', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      createAnswererFromEnv({
        OLLAMA_BASE_URL: 'https://llm.example',
        ...AZURE,
        AZURE_CLIENT_SECRET: '',
      })

      expect(wake).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('AZURE_CLIENT_SECRET'),
      )
      warn.mockRestore()
    })

    it('returns null without OLLAMA_BASE_URL', () => {
      expect(createAnswererFromEnv({ LLM_PROVIDER: 'ollama' })).toBeNull()
      expect(ollama).not.toHaveBeenCalled()
    })

    it('is allowed in production', () => {
      expect(
        createAnswererFromEnv({
          CONTEXT: 'production',
          OLLAMA_BASE_URL: 'https://llm.example',
        }),
      ).toBeTypeOf('function')
    })
  })

  describe('claude (local development only)', () => {
    it('builds an answerer when selected with an API key', () => {
      const answerer = createAnswererFromEnv({
        LLM_PROVIDER: 'claude',
        ANTHROPIC_API_KEY: 'test-key',
        CLAUDE_MODEL: 'claude-x',
        CLAUDE_EFFORT: 'low',
      })

      expect(answerer).toBeTypeOf('function')
      expect(claude).toHaveBeenCalledWith({ model: 'claude-x', effort: 'low' })
      expect(ollama).not.toHaveBeenCalled()
    })

    it('returns null without an API key', () => {
      expect(createAnswererFromEnv({ LLM_PROVIDER: 'claude' })).toBeNull()
    })

    it('is refused in production, with a warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const answerer = createAnswererFromEnv({
        LLM_PROVIDER: 'claude',
        ANTHROPIC_API_KEY: 'test-key',
        CONTEXT: 'production',
      })

      expect(answerer).toBeNull()
      expect(claude).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/production/))
      warn.mockRestore()
    })

    it.each(['deploy-preview', 'branch-deploy', 'dev'])(
      'is allowed in the %s context',
      (context) => {
        expect(
          createAnswererFromEnv({
            LLM_PROVIDER: 'claude',
            ANTHROPIC_API_KEY: 'test-key',
            CONTEXT: context,
          }),
        ).toBeTypeOf('function')
      },
    )
  })

  it('returns null and warns for an unknown provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      createAnswererFromEnv({
        LLM_PROVIDER: 'gpt',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      }),
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/gpt/))
    warn.mockRestore()
  })

  it('accepts the provider name in any case', () => {
    createAnswererFromEnv({
      LLM_PROVIDER: 'Claude',
      ANTHROPIC_API_KEY: 'test-key',
    })

    expect(claude).toHaveBeenCalled()
  })
})
