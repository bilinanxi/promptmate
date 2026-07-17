import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { aiNativeClient, type AiCreativityMode, type AiOptimizedPrompt } from './aiNativeClient'
import { validateAiProviderConfig, type AiProviderConfig } from './aiProviderConfig'
import { safeAiErrorMessage } from './safeAiError'
import { prepareVideoForPrompt, type PreparedVideo } from './videoPromptInput'

interface SelectedVideo extends PreparedVideo {
  name: string
}

interface VideoPromptWorkspaceProps {
  config: AiProviderConfig
  mode: AiCreativityMode
  onOpenSettings(): void
}

export function VideoPromptWorkspace({ config, mode, onOpenSettings }: VideoPromptWorkspaceProps) {
  const [video, setVideo] = useState<SelectedVideo | null>(null)
  const [result, setResult] = useState<AiOptimizedPrompt | null>(null)
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [pending, setPending] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const attempt = useRef(0)
  const requestId = useRef<string | null>(null)
  const extractionAbort = useRef<AbortController | null>(null)
  const providerFingerprint = `${config.kind}\u0000${config.baseUrl}\u0000${config.model}\u0000${mode}`
  const previousProviderFingerprint = useRef(providerFingerprint)

  useEffect(
    () => () => {
      attempt.current += 1
      extractionAbort.current?.abort()
      if (requestId.current) void aiNativeClient.cancel(requestId.current).catch(() => undefined)
    },
    [],
  )

  useEffect(() => {
    if (previousProviderFingerprint.current === providerFingerprint) return
    previousProviderFingerprint.current = providerFingerprint
    const activeRequest = requestId.current
    requestId.current = null
    extractionAbort.current?.abort()
    extractionAbort.current = null
    attempt.current += 1
    if (activeRequest) void aiNativeClient.cancel(activeRequest).catch(() => undefined)
    setPending(false)
    setProcessing(false)
    setResult(null)
    setError('')
    setStatus(video ? 'AI 设置已变化，请重新生成视频提示词。' : '')
  }, [providerFingerprint, video])

  function stopPending(message = '') {
    const activeRequest = requestId.current
    requestId.current = null
    extractionAbort.current?.abort()
    extractionAbort.current = null
    if (activeRequest) void aiNativeClient.cancel(activeRequest).catch(() => undefined)
    attempt.current += 1
    setPending(false)
    setProcessing(false)
    setStatus(message)
  }

  async function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    stopPending()
    setVideo(null)
    setResult(null)
    setError('')
    if (!file) return
    const selection = attempt.current
    const controller = new AbortController()
    extractionAbort.current = controller
    setProcessing(true)
    setStatus('正在本地解码并提取视频时间采样帧…')
    try {
      const prepared = await prepareVideoForPrompt(file, undefined, controller.signal)
      if (selection !== attempt.current) return
      setVideo({ name: file.name, ...prepared })
      setStatus('已在本地提取 6 张时间采样帧；原视频和时间采样帧均尚未发送。')
    } catch (reason) {
      if (selection === attempt.current) {
        setStatus('')
        setError(safeAiErrorMessage(reason, '视频转提示词失败，请检查模型和设置后重试。'))
      }
    } finally {
      if (extractionAbort.current === controller) extractionAbort.current = null
      if (selection === attempt.current) setProcessing(false)
    }
  }

  async function generate() {
    if (processing) {
      stopPending('已取消视频处理。')
      return
    }
    if (pending) {
      stopPending('已取消视频分析。')
      return
    }
    if (!video) return
    const configError = validateAiProviderConfig(config)
    if (configError) {
      setError(`请先完成 AI 设置：${configError}`)
      return
    }
    const currentAttempt = ++attempt.current
    const currentRequestId = `video-${Date.now()}-${currentAttempt}`
    requestId.current = currentRequestId
    setPending(true)
    setError('')
    setStatus('')
    try {
      const prompt = await aiNativeClient.generateFromVideo(
        config,
        {
          durationMs: video.durationMs,
          frames: video.frames.map(({ mimeType, base64, timeSeconds }) => ({
            timestampMs: Math.round(timeSeconds * 1000),
            mimeType,
            base64,
          })),
        },
        mode,
        currentRequestId,
      )
      if (currentAttempt !== attempt.current) return
      setResult({ zh: prompt.zh.trim(), en: prompt.en.trim() })
      setLanguage('zh')
      setStatus('已生成中英文视频提示词，可编辑后复制。')
    } catch (reason) {
      if (currentAttempt === attempt.current) {
        setError(safeAiErrorMessage(reason, '视频转提示词失败，请检查模型和设置后重试。'))
      }
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
      setStatus('已复制视频提示词。')
    } catch {
      setStatus('')
      setError('复制失败，请检查剪贴板权限后重试。')
    }
  }

  return (
    <section
      className="image-prompt-workspace video-prompt-workspace"
      aria-labelledby="video-prompt-title"
    >
      <div className="image-prompt-heading">
        <div>
          <p className="eyebrow">可选 AI 辅助</p>
          <h2 id="video-prompt-title">视频转提示词</h2>
          <p>在本地提取有序时间采样帧，生成语义对齐的中英文视频提示词。</p>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenSettings}>
          AI 设置
        </button>
      </div>
      <p className="image-privacy-note">
        点击生成后，仅发送 6 张去除元数据的 JPEG 时间采样帧到你配置的 AI
        服务；不会发送原视频或音频，也不会保存到词库。请选择支持多图视觉输入的模型。
      </p>
      <div className="image-prompt-body">
        <div className="image-picker video-picker">
          <label className="image-upload-button">
            选择参考视频
            <input type="file" accept="video/mp4,video/webm" onChange={selectVideo} />
          </label>
          <small>MP4（H.264）或 WebM，1–60 秒，最大 64 MiB、最高 3840 px；不分析音频</small>
          {video ? (
            <figure>
              <div className="video-frame-strip">
                {video.frames.map((frame, index) => (
                  <div className="video-frame" key={`${frame.timeSeconds}-${index}`}>
                    <img src={frame.previewUrl} alt={`视频时间采样帧 ${index + 1}`} />
                    <span>{frame.timeSeconds.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
              <figcaption>
                {video.name} · {video.width} × {video.height} ·{' '}
                {(video.durationMs / 1000).toFixed(1)} 秒 · 6 张已去元数据时间采样帧
              </figcaption>
            </figure>
          ) : (
            <div className="image-placeholder">原视频始终保留在本地，仅在生成时发送时间采样帧</div>
          )}
        </div>
        <div className="image-prompt-result">
          <div className="output-heading">
            <strong>生成结果</strong>
            <div className="language-switch" aria-label="视频提示词语言">
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
            aria-label="视频提示词结果"
            value={result?.[language] ?? ''}
            placeholder="选择视频并生成后，可在这里编辑结果。"
            disabled={!result}
            onChange={(event) => editResult(event.target.value)}
          />
          {pending ? (
            <div className="basket-ai-progress">
              <p>正在分析有序时间采样帧并生成中英文视频提示词…</p>
              <progress aria-label="视频转提示词进度" aria-valuetext="正在等待多图视觉模型响应" />
            </div>
          ) : null}
          <div className="output-actions">
            <button
              type="button"
              className="ai-optimize-button"
              disabled={!video && !processing}
              onClick={generate}
            >
              {processing ? '取消视频处理' : pending ? '取消视频分析' : '生成双语提示词'}
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
