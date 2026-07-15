import { describe, expect, it, vi } from 'vitest'
import type { AiProviderConfig } from './aiProviderConfig'
import { createAiNativeClient } from './aiNativeClient'

const config: AiProviderConfig = {
  version: 1,
  kind: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  model: 'example-model',
}
const testCredential = ['test', 'credential'].join('-')

const input = {
  zh: '雨夜人像',
  en: 'Rainy night portrait',
  categoryId: 'people-subjects',
  mediaType: 'image' as const,
  descriptionZh: '',
  descriptionEn: '',
  tags: [],
  aliasesZh: [],
  aliasesEn: [],
}

describe('AI native client', () => {
  it('keeps credentials inside native commands', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const client = createAiNativeClient({ isTauri: () => true, invoke })

    await client.saveApiKey(config, testCredential)

    expect(invoke).toHaveBeenCalledWith('save_ai_api_key', {
      config,
      apiKey: testCredential,
    })
  })

  it('passes only non-secret config and prompt fields to completion', async () => {
    const suggestion = {
      description_zh: '描述',
      description_en: 'Description',
      tags: ['雨夜'],
      aliases_zh: ['夜雨人像'],
      aliases_en: ['rain portrait'],
    }
    const invoke = vi.fn().mockResolvedValue(suggestion)
    const client = createAiNativeClient({ isTauri: () => true, invoke })

    await expect(client.complete(config, input, 'balanced', 'request-1')).resolves.toEqual(
      suggestion,
    )
    expect(invoke).toHaveBeenCalledWith('complete_prompt_fields', {
      config,
      input,
      mode: 'balanced',
      requestId: 'request-1',
    })
    await client.cancel('request-1')
    expect(invoke).toHaveBeenLastCalledWith('cancel_ai_request', { requestId: 'request-1' })
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain(testCredential)
  })

  it('fails explicitly instead of attempting network calls in browser preview', async () => {
    const invoke = vi.fn()
    const client = createAiNativeClient({ isTauri: () => false, invoke })

    await expect(client.testConnection(config)).rejects.toThrow('AI 功能仅在桌面应用中可用。')
    expect(invoke).not.toHaveBeenCalled()
  })
})
