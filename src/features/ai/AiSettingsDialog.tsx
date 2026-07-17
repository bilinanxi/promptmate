import { useState, type RefObject } from 'react'
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_PRESET_GROUP_LABELS,
  resolveAiProviderPresetId,
  type AiProviderConfig,
  type AiProviderPresetGroup,
  type AiProviderPresetId,
} from './aiProviderConfig'

interface AiSettingsDialogProps {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLSelectElement | null>
  draft: AiProviderConfig
  apiKey: string
  hasKey: boolean
  models: string[]
  busy: boolean
  status: string
  error: string
  onClose(): void
  onProviderChange(id: AiProviderPresetId): void
  onDraftChange(draft: AiProviderConfig): void
  onApiKeyChange(value: string): void
  onSyncModels(): void
  onUseManualModel(): void
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
  models,
  busy,
  status,
  error,
  onClose,
  onProviderChange,
  onDraftChange,
  onApiKeyChange,
  onSyncModels,
  onUseManualModel,
  onCheckKey,
  onClearKey,
  onTest,
  onSave,
}: AiSettingsDialogProps) {
  const [apiKeyVisible, setApiKeyVisible] = useState(true)
  const presetGroups = Object.keys(AI_PROVIDER_PRESET_GROUP_LABELS) as AiProviderPresetGroup[]
  const isLocalProvider = draft.kind === 'ollama' || draft.kind === 'lm-studio'

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
              value={resolveAiProviderPresetId(draft)}
              disabled={busy}
              onChange={(event) => onProviderChange(event.target.value as AiProviderPresetId)}
            >
              {presetGroups.map((group) => (
                <optgroup key={group} label={AI_PROVIDER_PRESET_GROUP_LABELS[group]}>
                  {AI_PROVIDER_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="provider-preset-hint">
            已预设支持 OpenAI-compatible 接口的国内外主流模型与 API 平台；选择后自动填写服务地址。
          </p>
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
            {models.length ? (
              <select
                value={draft.model}
                disabled={busy}
                onChange={(event) => onDraftChange({ ...draft, model: event.target.value })}
              >
                <option value="">请选择模型</option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.model}
                disabled={busy}
                onChange={(event) => onDraftChange({ ...draft, model: event.target.value })}
              />
            )}
          </label>
          <div className="model-sync-row">
            <button
              type="button"
              disabled={busy || (!isLocalProvider && !apiKey && !hasKey)}
              onClick={onSyncModels}
            >
              {busy ? '正在同步…' : '同步模型列表'}
            </button>
            {models.length ? (
              <button type="button" disabled={busy} onClick={onUseManualModel}>
                手动输入模型名称
              </button>
            ) : null}
            <small>从当前服务的官方 /models 接口读取，不会自动替你选择模型。</small>
          </div>
          <label>
            API Key（可选）
            <span className="api-key-input-wrap">
              <input
                type={apiKeyVisible ? 'text' : 'password'}
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                placeholder={
                  hasKey
                    ? '已安全保存；输入框仅保留当前会话内容'
                    : isLocalProvider
                      ? '本地服务通常可以留空'
                      : '远程服务通常需要 API Key'
                }
                onChange={(event) => onApiKeyChange(event.target.value)}
              />
              <button
                type="button"
                className="api-key-visibility"
                aria-label={apiKeyVisible ? '隐藏 API Key' : '显示 API Key'}
                title={apiKeyVisible ? '隐藏 API Key' : '显示 API Key'}
                onClick={() => setApiKeyVisible((visible) => !visible)}
              >
                {apiKeyVisible ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.6" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 4l16 16" />
                    <path d="M9.4 6.5A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a14.3 14.3 0 0 1-2.6 3.2M14.6 17.5c-.8.3-1.7.5-2.6.5-6 0-9.5-6-9.5-6a14.7 14.7 0 0 1 3.1-3.6" />
                  </svg>
                )}
              </button>
            </span>
          </label>
          <p className="credential-state">
            {hasKey ? '当前服务已保存 API Key。' : '当前服务没有已保存的 API Key。'}
          </p>
          <p className="ai-security-note">
            输入框内容仅保留在当前应用会话；API Key 仍只写入 Windows 凭据管理器，不进入
            localStorage、导出包或日志。远程 HTTP 地址会被拒绝。
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
