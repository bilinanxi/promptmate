import type { AiCreativityMode, AiFieldSuggestion } from './aiNativeClient'
import type { AiSuggestionSelection } from './aiSuggestion'

interface AiCompletionPanelProps {
  mode: AiCreativityMode
  completing: boolean
  enabled: boolean
  error: string
  suggestion: AiFieldSuggestion | null
  selection: AiSuggestionSelection | null
  onModeChange(mode: AiCreativityMode): void
  onComplete(): void
  onCancel(): void
  onSelectionChange(selection: AiSuggestionSelection): void
  onApply(): void
  onDiscard(): void
}

export function AiCompletionPanel({
  mode,
  completing,
  enabled,
  error,
  suggestion,
  selection,
  onModeChange,
  onComplete,
  onCancel,
  onSelectionChange,
  onApply,
  onDiscard,
}: AiCompletionPanelProps) {
  return (
    <div className="ai-completion-section">
      <div className="ai-completion-toolbar">
        <label>
          创意档位
          <select
            value={mode}
            disabled={completing}
            onChange={(event) => onModeChange(event.target.value as AiCreativityMode)}
          >
            <option value="faithful">忠实</option>
            <option value="balanced">均衡</option>
            <option value="creative">创意</option>
          </select>
        </label>
        {completing ? (
          <button type="button" onClick={onCancel}>
            取消 AI 补全
          </button>
        ) : (
          <button type="button" disabled={!enabled} onClick={onComplete}>
            AI 补全
          </button>
        )}
      </div>
      <p className="ai-completion-hint">AI 仅建议可选字段；结果不会自动保存或覆盖已有内容。</p>
      {error ? <p role="alert">{error}</p> : null}
      {suggestion && selection ? (
        <fieldset className="ai-suggestion-preview" aria-label="AI 补全预览">
          <legend>AI 补全预览</legend>
          <label>
            <input
              type="checkbox"
              aria-label="采用中文描述"
              checked={selection.descriptionZh}
              onChange={(event) =>
                onSelectionChange({ ...selection, descriptionZh: event.target.checked })
              }
            />
            <span>中文描述</span>
            <output>{suggestion.description_zh || '无建议'}</output>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="采用英文描述"
              checked={selection.descriptionEn}
              onChange={(event) =>
                onSelectionChange({ ...selection, descriptionEn: event.target.checked })
              }
            />
            <span>英文描述</span>
            <output>{suggestion.description_en || '无建议'}</output>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="采用标签"
              checked={selection.tags}
              onChange={(event) => onSelectionChange({ ...selection, tags: event.target.checked })}
            />
            <span>标签</span>
            <output>{suggestion.tags.join(', ') || '无建议'}</output>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="采用中文别名"
              checked={selection.aliasesZh}
              onChange={(event) =>
                onSelectionChange({ ...selection, aliasesZh: event.target.checked })
              }
            />
            <span>中文别名</span>
            <output>{suggestion.aliases_zh.join(', ') || '无建议'}</output>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="采用英文别名"
              checked={selection.aliasesEn}
              onChange={(event) =>
                onSelectionChange({ ...selection, aliasesEn: event.target.checked })
              }
            />
            <span>英文别名</span>
            <output>{suggestion.aliases_en.join(', ') || '无建议'}</output>
          </label>
          <div className="ai-suggestion-actions">
            <button type="button" onClick={onDiscard}>
              放弃建议
            </button>
            <button
              type="button"
              disabled={!Object.values(selection).some(Boolean)}
              onClick={onApply}
            >
              应用所选内容
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}
