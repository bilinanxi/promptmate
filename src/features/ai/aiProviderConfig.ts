export type AiProviderKind = 'openai-compatible' | 'ollama' | 'lm-studio'

export interface AiProviderConfig {
  version: 1
  kind: AiProviderKind
  baseUrl: string
  model: string
}

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter {
  setItem(key: string, value: string): void
}

export const AI_PROVIDER_STORAGE_KEY = 'promptmate:ai-provider'

const defaults: Record<AiProviderKind, AiProviderConfig> = {
  'openai-compatible': {
    version: 1,
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
  },
  ollama: {
    version: 1,
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: '',
  },
  'lm-studio': {
    version: 1,
    kind: 'lm-studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
  },
}

export function defaultAiProviderConfig(kind: AiProviderKind): AiProviderConfig {
  return { ...defaults[kind] }
}

function isProviderKind(value: unknown): value is AiProviderKind {
  return value === 'openai-compatible' || value === 'ollama' || value === 'lm-studio'
}

function isLoopback(hostname: string): boolean {
  if (hostname === '::1' || hostname === '[::1]') return true
  if (!/^127(?:\.\d{1,3}){3}$/.test(hostname)) return false
  return hostname.split('.').every((part) => Number(part) <= 255)
}

export function validateAiProviderConfig(config: AiProviderConfig): string {
  if (config.version !== 1 || !isProviderKind(config.kind)) return 'AI 服务配置版本或类型无效。'
  if (config.baseUrl.length > 2048) return 'AI 服务地址无效。'
  let url: URL
  try {
    url = new URL(config.baseUrl)
  } catch {
    return '服务地址不是有效 URL。'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '服务地址仅支持 HTTP 或 HTTPS。'
  if (url.username || url.password || url.search || url.hash)
    return '服务地址不能包含凭据、查询或片段。'
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) return '远程服务必须使用 HTTPS。'
  if (!config.model.trim()) return '模型名称不能为空。'
  if (
    config.model.length > 200 ||
    [...config.model].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    return '模型名称无效。'
  }
  return ''
}

function isConfig(value: unknown): value is AiProviderConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.keys(value).sort().join(',') !== 'baseUrl,kind,model,version') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === 1 &&
    isProviderKind(candidate.kind) &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.model === 'string' &&
    candidate.baseUrl.length <= 2048 &&
    candidate.model.length <= 200 &&
    validateAiProviderConfig(candidate as unknown as AiProviderConfig) === ''
  )
}

export function loadAiProviderConfig(storage: StorageReader): AiProviderConfig {
  const fallback = defaultAiProviderConfig('openai-compatible')
  try {
    const raw = storage.getItem(AI_PROVIDER_STORAGE_KEY)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return isConfig(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function saveAiProviderConfig(storage: StorageWriter, config: AiProviderConfig): boolean {
  if (!isConfig(config)) return false
  try {
    storage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}
