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

  it('loads provider model identifiers through the native boundary', async () => {
    const models = ['MiniMax-M3', 'MiniMax-M2.7']
    const invoke = vi.fn().mockResolvedValue(models)
    const client = createAiNativeClient({ isTauri: () => true, invoke })

    await expect(client.listModels({ ...config, model: '' })).resolves.toEqual(models)
    expect(invoke).toHaveBeenCalledWith('list_ai_models', {
      config: { ...config, model: '' },
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

  it('passes only the composed prompt and non-secret settings to basket optimization', async () => {
    const optimized = { zh: '优化后的提示词', en: 'Optimized prompt' }
    const invoke = vi.fn().mockResolvedValue(optimized)
    const client = createAiNativeClient({ isTauri: () => true, invoke })

    await expect(
      client.optimize(
        config,
        { zh: '雨夜街道，中近景。', en: 'Rainy street, medium close-up.' },
        'balanced',
        'basket-1',
      ),
    ).resolves.toEqual(optimized)
    expect(invoke).toHaveBeenCalledWith('optimize_composed_prompt', {
      config,
      promptZh: '雨夜街道，中近景。',
      promptEn: 'Rainy street, medium close-up.',
      mode: 'balanced',
      requestId: 'basket-1',
    })
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain(testCredential)
  })

  it('passes bounded image input through the native multimodal command', async () => {
    const prompt = { zh: '红色陶瓷杯，柔和侧光。', en: 'Red ceramic mug, soft side light.' }
    const invoke = vi.fn().mockResolvedValue(prompt)
    const client = createAiNativeClient({ isTauri: () => true, invoke })

    await expect(
      client.generateFromImage(
        config,
        { mimeType: 'image/jpeg', base64: '/9j/2Q==' },
        'balanced',
        'image-1',
      ),
    ).resolves.toEqual(prompt)
    expect(invoke).toHaveBeenCalledWith('generate_prompt_from_image', {
      config,
      input: { mimeType: 'image/jpeg', base64: '/9j/2Q==' },
      mode: 'balanced',
      requestId: 'image-1',
    })
  })

  it('passes bounded ordered video frames through the native multimodal command', async () => {
    const prompt = {
      zh: {
        scene: '雨夜街道',
        subject_motion: '人物向前奔跑',
        camera_motion: '镜头缓慢推进',
        temporal_change: '雨势增强',
        transition: '',
      },
      en: {
        scene: 'A rainy street',
        subject_motion: 'A person runs forward',
        camera_motion: 'The camera slowly pushes in',
        temporal_change: 'The rain intensifies',
        transition: '',
      },
    }
    const invoke = vi.fn().mockResolvedValue(prompt)
    const client = createAiNativeClient({ isTauri: () => true, invoke })
    const video = {
      durationMs: 12_000,
      frames: [
        { timestampMs: 1_000, mimeType: 'image/jpeg' as const, base64: '/9j/2Q==' },
        { timestampMs: 9_000, mimeType: 'image/jpeg' as const, base64: '/9j/AAH/2Q==' },
      ],
    }

    await expect(client.generateFromVideo(config, video, 'balanced', 'video-1')).resolves.toEqual(
      prompt,
    )
    expect(invoke).toHaveBeenCalledWith('generate_prompt_from_video', {
      config,
      input: video,
      mode: 'balanced',
      requestId: 'video-1',
    })
  })

  it('fails explicitly instead of attempting network calls in browser preview', async () => {
    const invoke = vi.fn()
    const client = createAiNativeClient({ isTauri: () => false, invoke })

    await expect(client.testConnection(config)).rejects.toThrow('AI 功能仅在桌面应用中可用。')
    expect(invoke).not.toHaveBeenCalled()
  })
})
