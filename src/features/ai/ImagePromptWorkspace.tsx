import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  aiNativeClient,
  type AiCreativityMode,
  type AiOptimizedPrompt,
  type ImagePromptInput,
} from './aiNativeClient'
import { validateAiProviderConfig, type AiProviderConfig } from './aiProviderConfig'
import { prepareImageForPrompt } from './imagePromptInput'

interface SelectedImage extends ImagePromptInput {
  name: string
  previewUrl: string
  width: number
  height: number
  byteCount: number
}

interface ImagePromptWorkspaceProps {
  config: AiProviderConfig
  mode: AiCreativityMode
  onOpenSettings(): void
}

function safeMessage(error: unknown) {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '图片转提示词失败，请检查模型和设置后重试。'
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 300)
}

export function ImagePromptWorkspace({ config, mode, onOpenSettings }: ImagePromptWorkspaceProps) {
  const [image, setImage] = useState<SelectedImage | null>(null)
  const [result, setResult] = useState<AiOptimizedPrompt | null>(null)
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const attempt = useRef(0)
  const requestId = useRef<string | null>(null)
  const providerFingerprint = `${config.kind}\u0000${config.baseUrl}\u0000${config.model}\u0000${mode}`
  const previousProviderFingerprint = useRef(providerFingerprint)

  useEffect(
    () => () => {
      attempt.current += 1
      if (requestId.current) void aiNativeClient.cancel(requestId.current).catch(() => undefined)
    },
    [],
  )

  useEffect(() => {
    if (previousProviderFingerprint.current === providerFingerprint) return
    previousProviderFingerprint.current = providerFingerprint
    const activeRequest = requestId.current
    requestId.current = null
    attempt.current += 1
    if (activeRequest) void aiNativeClient.cancel(activeRequest).catch(() => undefined)
    setPending(false)
    setResult(null)
    setError('')
    setStatus(image ? 'AI 设置已变化，请重新生成图片提示词。' : '')
  }, [providerFingerprint, image])

  function stopPending(message = '') {
    const activeRequest = requestId.current
    requestId.current = null
    if (activeRequest) void aiNativeClient.cancel(activeRequest).catch(() => undefined)
    attempt.current += 1
    setPending(false)
    setStatus(message)
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    stopPending()
    setImage(null)
    setResult(null)
    setError('')
    if (!file) return
    const selection = attempt.current
    setStatus('正在安全处理图片…')
    try {
      const prepared = await prepareImageForPrompt(file)
      if (selection !== attempt.current) return
      setImage({
        name: file.name,
        ...prepared,
      })
      setStatus('已移除图片元数据；图片仅保留在当前会话，尚未发送。')
    } catch (reason) {
      if (selection === attempt.current) {
        setStatus('')
        setError(safeMessage(reason))
      }
    }
  }

  async function generate() {
    if (pending) {
      stopPending('已取消图片分析。')
      return
    }
    if (!image) return
    const configError = validateAiProviderConfig(config)
    if (configError) {
      setError(`请先完成 AI 设置：${configError}`)
      return
    }
    const currentAttempt = ++attempt.current
    const currentRequestId = `image-${Date.now()}-${currentAttempt}`
    requestId.current = currentRequestId
    setPending(true)
    setError('')
    setStatus('')
    try {
      const prompt = await aiNativeClient.generateFromImage(
        config,
        { mimeType: image.mimeType, base64: image.base64 },
        mode,
        currentRequestId,
      )
      if (currentAttempt !== attempt.current) return
      setResult({ zh: prompt.zh.trim(), en: prompt.en.trim() })
      setLanguage('zh')
      setStatus('已生成中英文提示词，可编辑后复制。')
    } catch (reason) {
      if (currentAttempt === attempt.current) setError(safeMessage(reason))
    } finally {
      if (currentAttempt === attempt.current) {
        requestId.current = null
        setPending(false)
      }
    }
  }

  function editResult(value: string) {
    if (!result) return
    setResult({ ...result, [language]: value })
    if (pending) {
      stopPending('内容已修改，AI 结果未覆盖。')
    } else {
      setStatus((current) => (current === '内容已修改，AI 结果未覆盖。' ? current : ''))
    }
  }

  async function copyResult() {
    const value = result?.[language].trim()
    if (!value) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setError('')
      setStatus('已复制图片提示词。')
    } catch {
      setStatus('')
      setError('复制失败，请检查剪贴板权限后重试。')
    }
  }

  return (
    <section className="image-prompt-workspace" aria-labelledby="image-prompt-title">
      <div className="image-prompt-heading">
        <div>
          <p className="eyebrow">可选 AI 辅助</p>
          <h2 id="image-prompt-title">图片转提示词</h2>
          <p>选择参考图片，生成语义对齐的中英文图片提示词。</p>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenSettings}>
          AI 设置
        </button>
      </div>
      <p className="image-privacy-note">
        点击生成后，去除元数据的 JPEG 图片才会发送到你配置的 AI
        服务；请选择支持视觉输入的模型。图片不会保存到词库。
      </p>
      <div className="image-prompt-body">
        <div className="image-picker">
          <label className="image-upload-button">
            选择参考图片
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} />
          </label>
          <small>JPEG、PNG 或 WebP，最大 8 MiB</small>
          {image ? (
            <figure>
              <img src={image.previewUrl} alt="参考图片预览" />
              <figcaption>
                {image.name} · {image.width} × {image.height} ·{' '}
                {Math.max(1, Math.round(image.byteCount / 1024))} KiB（已去除元数据）
              </figcaption>
            </figure>
          ) : (
            <div className="image-placeholder">图片仅在点击生成后发送</div>
          )}
        </div>
        <div className="image-prompt-result">
          <div className="output-heading">
            <strong>生成结果</strong>
            <div className="language-switch" aria-label="图片提示词语言">
              <button
                type="button"
                className={language === 'zh' ? 'active' : ''}
                aria-pressed={language === 'zh'}
                onClick={() => setLanguage('zh')}
              >
                中文
              </button>
              <button
                type="button"
                className={language === 'en' ? 'active' : ''}
                aria-pressed={language === 'en'}
                onClick={() => setLanguage('en')}
              >
                EN
              </button>
            </div>
          </div>
          <textarea
            aria-label="图片提示词结果"
            value={result?.[language] ?? ''}
            placeholder="选择图片并生成后，可在这里编辑结果。"
            disabled={!result}
            onChange={(event) => editResult(event.target.value)}
          />
          {pending ? (
            <div className="basket-ai-progress">
              <p>正在分析图片并生成中英文提示词…</p>
              <progress aria-label="图片转提示词进度" aria-valuetext="正在等待视觉模型响应" />
            </div>
          ) : null}
          <div className="output-actions">
            <button
              type="button"
              className="ai-optimize-button"
              disabled={!image}
              onClick={generate}
            >
              {pending ? '取消图片分析' : '生成双语提示词'}
            </button>
            <button
              type="button"
              className="copy-button"
              disabled={!result?.[language].trim()}
              onClick={copyResult}
            >
              复制当前提示词
            </button>
          </div>
          {error ? (
            <p role="alert" className="basket-ai-feedback error">
              {error}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="basket-ai-feedback success">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
