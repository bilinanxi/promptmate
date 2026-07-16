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

export type AiProviderPresetGroup =
  'domestic-model' | 'domestic-api' | 'international-model' | 'international-api' | 'local-custom'

export type AiProviderPresetId =
  | 'deepseek'
  | 'minimax-cn'
  | 'minimax-global'
  | 'zhipu'
  | 'kimi'
  | 'stepfun'
  | 'baichuan'
  | 'lingyiwanwu'
  | 'alibaba-bailian'
  | 'siliconflow'
  | 'volcengine-ark'
  | 'tencent-hunyuan'
  | 'baidu-qianfan'
  | 'modelscope'
  | 'openai'
  | 'google-gemini'
  | 'xai'
  | 'mistral'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'nvidia-nim'
  | 'ollama'
  | 'lm-studio'
  | 'custom'

export interface AiProviderPreset {
  id: AiProviderPresetId
  label: string
  group: AiProviderPresetGroup
  kind: AiProviderKind
  baseUrl: string
}

export const AI_PROVIDER_PRESET_GROUP_LABELS: Record<AiProviderPresetGroup, string> = {
  'domestic-model': '国内主流模型平台',
  'domestic-api': '国内主流 API 平台',
  'international-model': '国外主流模型平台',
  'international-api': '国外主流 API 平台',
  'local-custom': '本地与自定义',
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'minimax-cn',
    label: 'MiniMax（中国）',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
  },
  {
    id: 'minimax-global',
    label: 'MiniMax（国际）',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.minimax.io/v1',
  },
  {
    id: 'zhipu',
    label: '智谱 AI（BigModel）',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'kimi',
    label: '月之暗面 Kimi',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
  },
  {
    id: 'stepfun',
    label: '阶跃星辰 StepFun',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.stepfun.com/v1',
  },
  {
    id: 'baichuan',
    label: '百川智能',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.baichuan-ai.com/v1',
  },
  {
    id: 'lingyiwanwu',
    label: '零一万物',
    group: 'domestic-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
  },
  {
    id: 'alibaba-bailian',
    label: '阿里云百炼',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  {
    id: 'volcengine-ark',
    label: '火山引擎方舟',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    id: 'tencent-hunyuan',
    label: '腾讯混元',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
  },
  {
    id: 'baidu-qianfan',
    label: '百度智能云千帆',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://qianfan.baidubce.com/v2',
  },
  {
    id: 'modelscope',
    label: '魔搭 ModelScope',
    group: 'domestic-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    group: 'international-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'google-gemini',
    label: 'Google Gemini',
    group: 'international-model',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  {
    id: 'xai',
    label: 'xAI（Grok）',
    group: 'international-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    group: 'international-model',
    kind: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'groq',
    label: 'GroqCloud',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'together',
    label: 'Together AI',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
  },
  {
    id: 'cerebras',
    label: 'Cerebras Inference',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://api.cerebras.ai/v1',
  },
  {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    group: 'international-api',
    kind: 'openai-compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    group: 'local-custom',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
  },
  {
    id: 'lm-studio',
    label: 'LM Studio（本地）',
    group: 'local-custom',
    kind: 'lm-studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI-compatible',
    group: 'local-custom',
    kind: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
  },
]

export function defaultAiProviderPresetConfig(id: AiProviderPresetId): AiProviderConfig {
  const preset = AI_PROVIDER_PRESETS.find((candidate) => candidate.id === id)
  if (!preset) return defaultAiProviderConfig('openai-compatible')
  return { version: 1, kind: preset.kind, baseUrl: preset.baseUrl, model: '' }
}

function normalizedEndpoint(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveAiProviderPresetId(config: AiProviderConfig): AiProviderPresetId {
  const endpoint = normalizedEndpoint(config.baseUrl)
  return (
    AI_PROVIDER_PRESETS.find(
      (preset) =>
        preset.id !== 'custom' &&
        preset.kind === config.kind &&
        normalizedEndpoint(preset.baseUrl) === endpoint,
    )?.id ?? 'custom'
  )
}

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
