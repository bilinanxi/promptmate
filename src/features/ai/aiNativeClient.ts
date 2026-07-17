import type { AiProviderConfig } from './aiProviderConfig'
import type { MediaType } from '../prompt-library/types'

export type AiCreativityMode = 'faithful' | 'balanced' | 'creative'

export interface AiCompletionInput {
  zh: string
  en: string
  categoryId: string
  mediaType: MediaType
  descriptionZh: string
  descriptionEn: string
  tags: string[]
  aliasesZh: string[]
  aliasesEn: string[]
}

export interface AiFieldSuggestion {
  description_zh: string
  description_en: string
  tags: string[]
  aliases_zh: string[]
  aliases_en: string[]
}

export interface AiOptimizedPrompt {
  zh: string
  en: string
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100)
  )
}

export function isAiFieldSuggestion(value: unknown): value is AiFieldSuggestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (
    Object.keys(value).sort().join(',') !==
    'aliases_en,aliases_zh,description_en,description_zh,tags'
  )
    return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.description_zh === 'string' &&
    candidate.description_zh.length <= 2000 &&
    typeof candidate.description_en === 'string' &&
    candidate.description_en.length <= 2000 &&
    isStringList(candidate.tags) &&
    isStringList(candidate.aliases_zh) &&
    isStringList(candidate.aliases_en)
  )
}

interface NativeEnvironment {
  isTauri(): boolean
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

export interface AiNativeClient {
  saveApiKey(config: AiProviderConfig, apiKey: string): Promise<void>
  deleteApiKey(config: AiProviderConfig): Promise<void>
  hasApiKey(config: AiProviderConfig): Promise<boolean>
  testConnection(config: AiProviderConfig): Promise<string>
  complete(
    config: AiProviderConfig,
    input: AiCompletionInput,
    mode: AiCreativityMode,
    requestId: string,
  ): Promise<AiFieldSuggestion>
  optimize(
    config: AiProviderConfig,
    prompt: AiOptimizedPrompt,
    mode: AiCreativityMode,
    requestId: string,
  ): Promise<AiOptimizedPrompt>
  cancel(requestId: string): Promise<void>
}

const defaultEnvironment: NativeEnvironment = {
  isTauri: () => '__TAURI_INTERNALS__' in window,
  invoke: async <T>(command: string, args?: Record<string, unknown>) =>
    (await import('@tauri-apps/api/core')).invoke<T>(command, args),
}

export function createAiNativeClient(
  environment: NativeEnvironment = defaultEnvironment,
): AiNativeClient {
  function desktopOnly<T>(command: string, args: Record<string, unknown>): Promise<T> {
    if (!environment.isTauri()) return Promise.reject(new Error('AI 功能仅在桌面应用中可用。'))
    return environment.invoke<T>(command, args)
  }

  return {
    saveApiKey: (config, apiKey) =>
      desktopOnly<void>('save_ai_api_key', {
        config,
        apiKey,
      }),
    deleteApiKey: (config) => desktopOnly<void>('delete_ai_api_key', { config }),
    hasApiKey: (config) => desktopOnly<boolean>('has_ai_api_key', { config }),
    testConnection: (config) => desktopOnly<string>('test_ai_provider', { config }),
    complete: (config, input, mode, requestId) =>
      desktopOnly<AiFieldSuggestion>('complete_prompt_fields', { config, input, mode, requestId }),
    optimize: (config, prompt, mode, requestId) =>
      desktopOnly<AiOptimizedPrompt>('optimize_composed_prompt', {
        config,
        promptZh: prompt.zh,
        promptEn: prompt.en,
        mode,
        requestId,
      }),
    cancel: (requestId) => desktopOnly<void>('cancel_ai_request', { requestId }),
  }
}

export const aiNativeClient = createAiNativeClient()
