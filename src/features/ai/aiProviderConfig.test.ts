import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_PRESETS,
  defaultAiProviderPresetConfig,
  defaultAiProviderConfig,
  loadAiProviderConfig,
  resolveAiProviderPresetId,
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
  it('offers grouped domestic and international model and API platform presets', () => {
    expect(AI_PROVIDER_PRESETS.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'deepseek',
        'minimax-cn',
        'zhipu',
        'alibaba-bailian',
        'siliconflow',
        'openai',
        'google-gemini',
        'xai',
        'openrouter',
        'groq',
        'ollama',
        'lm-studio',
        'custom',
      ]),
    )
    expect(defaultAiProviderPresetConfig('minimax-cn').baseUrl).toBe('https://api.minimaxi.com/v1')
    expect(defaultAiProviderPresetConfig('deepseek').baseUrl).toBe('https://api.deepseek.com/v1')
    expect(defaultAiProviderPresetConfig('zhipu').baseUrl).toBe(
      'https://open.bigmodel.cn/api/paas/v4',
    )
    expect(defaultAiProviderPresetConfig('alibaba-bailian').baseUrl).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    expect(defaultAiProviderPresetConfig('siliconflow').baseUrl).toBe(
      'https://api.siliconflow.cn/v1',
    )
    expect(new Set(AI_PROVIDER_PRESETS.map(({ id }) => id)).size).toBe(AI_PROVIDER_PRESETS.length)
    for (const preset of AI_PROVIDER_PRESETS) {
      expect(
        validateAiProviderConfig({
          ...defaultAiProviderPresetConfig(preset.id),
          model: 'model-id',
        }),
        preset.label,
      ).toBe('')
    }
  })

  it('recognizes a preset endpoint and falls back to custom after manual editing', () => {
    const preset = defaultAiProviderPresetConfig('openrouter')
    expect(resolveAiProviderPresetId(preset)).toBe('openrouter')
    expect(
      resolveAiProviderPresetId({ ...preset, baseUrl: 'https://gateway.example.com/v1' }),
    ).toBe('custom')
  })

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
