import type { AiFieldSuggestion } from './aiNativeClient'

export interface AiEditableFields {
  descriptionZh: string
  descriptionEn: string
  tags: string
  aliasesZh: string
  aliasesEn: string
}

export type AiSuggestionSelection = Record<keyof AiEditableFields, boolean>

export function defaultAiSuggestionSelection(
  fields: AiEditableFields,
  suggestion: AiFieldSuggestion,
): AiSuggestionSelection {
  return {
    descriptionZh: !fields.descriptionZh.trim() && Boolean(suggestion.description_zh),
    descriptionEn: !fields.descriptionEn.trim() && Boolean(suggestion.description_en),
    tags: !fields.tags.trim() && suggestion.tags.length > 0,
    aliasesZh: !fields.aliasesZh.trim() && suggestion.aliases_zh.length > 0,
    aliasesEn: !fields.aliasesEn.trim() && suggestion.aliases_en.length > 0,
  }
}

export function applyAiSuggestion<T extends AiEditableFields>(
  fields: T,
  suggestion: AiFieldSuggestion,
  selection: AiSuggestionSelection,
): T {
  return {
    ...fields,
    descriptionZh: selection.descriptionZh ? suggestion.description_zh : fields.descriptionZh,
    descriptionEn: selection.descriptionEn ? suggestion.description_en : fields.descriptionEn,
    tags: selection.tags ? suggestion.tags.join(', ') : fields.tags,
    aliasesZh: selection.aliasesZh ? suggestion.aliases_zh.join(', ') : fields.aliasesZh,
    aliasesEn: selection.aliasesEn ? suggestion.aliases_en.join(', ') : fields.aliasesEn,
  }
}

export function applyAiSuggestionWithoutStaleOverwrite<T extends AiEditableFields>(
  current: T,
  baseline: AiEditableFields,
  suggestion: AiFieldSuggestion,
  selection: AiSuggestionSelection,
): { fields: T; conflicts: (keyof AiEditableFields)[] } {
  const keys = Object.keys(selection) as (keyof AiEditableFields)[]
  const conflicts = keys.filter((key) => selection[key] && current[key] !== baseline[key])
  const safeSelection = { ...selection }
  conflicts.forEach((key) => {
    safeSelection[key] = false
  })
  return {
    fields: applyAiSuggestion(current, suggestion, safeSelection),
    conflicts,
  }
}
