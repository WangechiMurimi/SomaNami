// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnswererFromEnv } from './answerer-from-env.ts'
import { createClaudeAnswerer } from './claude-answerer.ts'
import { createOllamaAnswerer } from './ollama-answerer.ts'

vi.mock('./claude-answerer.ts', () => ({
  createClaudeAnswerer: vi.fn(() => async () => ({ kind: 'refusal' })),
}))
vi.mock('./ollama-answerer.ts', () => ({
  createOllamaAnswerer: vi.fn(() => async () => ({ kind: 'refusal' })),
}))

const claude = vi.mocked(createClaudeAnswerer)
const ollama = vi.mocked(createOllamaAnswerer)

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
