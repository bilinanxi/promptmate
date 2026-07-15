import type { RefObject } from 'react'
import type { AiProviderConfig, AiProviderKind } from './aiProviderConfig'

interface AiSettingsDialogProps {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLSelectElement | null>
  draft: AiProviderConfig
  apiKey: string
  hasKey: boolean
  busy: boolean
  status: string
  error: string
  onClose(): void
  onProviderChange(kind: AiProviderKind): void
  onDraftChange(draft: AiProviderConfig): void
  onApiKeyChange(value: string): void
  onCheckKey(): void
  onClearKey(): void
  onTest(): void
  onSave(): void
}

export function AiSettingsDialog({
  dialogRef,
  initialFocusRef,
  draft,
  apiKey,
  hasKey,
  busy,
  status,
  error,
  onClose,
  onProviderChange,
  onDraftChange,
  onApiKeyChange,
  onCheckKey,
  onClearKey,
  onTest,
  onSave,
}: AiSettingsDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="ai-settings-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        aria-busy={busy}
      >
        <div className="create-dialog-heading">
          <div>
            <h2 id="ai-settings-title">AI 提供商设置</h2>
            <p>配置只保留非敏感参数，API Key 进入 Windows 凭据管理器。</p>
          </div>
          <button type="button" aria-label="关闭 AI 提供商设置" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ai-settings-form">
          <label>
            AI 提供商
            <select
              ref={initialFocusRef}
              value={draft.kind}
              disabled={busy}
              onChange={(event) => onProviderChange(event.target.value as AiProviderKind)}
            >
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="ollama">Ollama</option>
              <option value="lm-studio">LM Studio</option>
            </select>
          </label>
          <label>
            服务地址
            <input
              value={draft.baseUrl}
              disabled={busy}
              onChange={(event) => onDraftChange({ ...draft, baseUrl: event.target.value })}
            />
          </label>
          <label>
            模型名称
            <input
              value={draft.model}
              disabled={busy}
              onChange={(event) => onDraftChange({ ...draft, model: event.target.value })}
            />
          </label>
          <label>
            API Key（可选）
            <input
              type="password"
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={busy}
              placeholder={hasKey ? '已安全保存；留空保持不变' : '本地服务通常可以留空'}
              onChange={(event) => onApiKeyChange(event.target.value)}
            />
          </label>
          <p className="credential-state">
            {hasKey ? '当前服务已保存 API Key。' : '当前服务没有已保存的 API Key。'}
          </p>
          <p className="ai-security-note">
            PromptMate 不会把 API Key 写入 localStorage、导出包或日志。远程 HTTP 地址会被拒绝。
          </p>
          {error ? <p role="alert">{error}</p> : null}
          {status ? (
            <p role="status" aria-live="polite">
              {status}
            </p>
          ) : null}
          <div className="ai-settings-actions">
            <button type="button" disabled={busy} onClick={onCheckKey}>
              检查凭据
            </button>
            {hasKey ? (
              <button type="button" disabled={busy} onClick={onClearKey}>
                清除 API Key
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={onTest}>
              {busy ? '正在处理…' : '测试连接'}
            </button>
            <button type="button" disabled={busy} onClick={onSave}>
              保存设置
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
