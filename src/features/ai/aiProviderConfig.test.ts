import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_STORAGE_KEY,
  defaultAiProviderConfig,
  loadAiProviderConfig,
  saveAiProviderConfig,
  validateAiProviderConfig,
} from './aiProviderConfig'

const openAi = {
  version: 1 as const,
  kind: 'openai-compatible' as const,
  baseUrl: 'https://api.example.com/v1',
  model: 'example-model',
}

describe('AI provider config', () => {
  it('uses safe provider-specific defaults without embedding credentials', () => {
    expect(defaultAiProviderConfig('ollama')).toEqual({
      version: 1,
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: '',
    })
    expect(defaultAiProviderConfig('lm-studio').baseUrl).toBe('http://127.0.0.1:1234/v1')
    expect(JSON.stringify(defaultAiProviderConfig('openai-compatible'))).not.toMatch(/api.?key/i)
  })

  it('round-trips only strict non-secret configuration', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(saveAiProviderConfig(storage, openAi)).toBe(true)
    expect(loadAiProviderConfig(storage)).toEqual(openAi)
    expect(values.get(AI_PROVIDER_STORAGE_KEY)).toBe(JSON.stringify(openAi))
  })

  it('fails closed for malformed roots, unknown fields, and insecure remote HTTP', () => {
    const storage = {
      getItem: () => JSON.stringify({ ...openAi, apiKey: ['must', 'not', 'load'].join('-') }),
    }

    expect(loadAiProviderConfig(storage)).toEqual(defaultAiProviderConfig('openai-compatible'))
    expect(validateAiProviderConfig({ ...openAi, baseUrl: 'http://api.example.com/v1' })).toBe(
      '远程服务必须使用 HTTPS。',
    )
    expect(validateAiProviderConfig({ ...openAi, baseUrl: 'http://127.evil.example/v1' })).toBe(
      '远程服务必须使用 HTTPS。',
    )
    expect(validateAiProviderConfig({ ...openAi, baseUrl: 'http://localhost:11434/v1' })).toBe(
      '远程服务必须使用 HTTPS。',
    )
    expect(validateAiProviderConfig({ ...openAi, baseUrl: 'http://127.0.0.1:8080/v1' })).toBe('')
  })
})
