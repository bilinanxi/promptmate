import { describe, expect, it } from 'vitest'
import type { AiFieldSuggestion } from './aiNativeClient'
import {
  applyAiSuggestion,
  applyAiSuggestionWithoutStaleOverwrite,
  defaultAiSuggestionSelection,
} from './aiSuggestion'

const suggestion: AiFieldSuggestion = {
  description_zh: 'AI 中文描述',
  description_en: 'AI English description',
  tags: ['人像', '雨夜'],
  aliases_zh: ['夜雨肖像'],
  aliases_en: ['rain portrait'],
}

const draft = {
  descriptionZh: '用户中文描述',
  descriptionEn: '',
  tags: '用户标签',
  aliasesZh: '',
  aliasesEn: '',
}

describe('AI suggestion application', () => {
  it('selects only suggestions for currently empty fields by default', () => {
    expect(defaultAiSuggestionSelection(draft, suggestion)).toEqual({
      descriptionZh: false,
      descriptionEn: true,
      tags: false,
      aliasesZh: true,
      aliasesEn: true,
    })
  })

  it('changes only fields the user explicitly selected', () => {
    expect(
      applyAiSuggestion(draft, suggestion, {
        descriptionZh: false,
        descriptionEn: true,
        tags: true,
        aliasesZh: false,
        aliasesEn: true,
      }),
    ).toEqual({
      descriptionZh: '用户中文描述',
      descriptionEn: 'AI English description',
      tags: '人像, 雨夜',
      aliasesZh: '',
      aliasesEn: 'rain portrait',
    })
  })

  it('preserves fields changed after preview and reports the conflict', () => {
    const baseline = { ...draft, descriptionEn: '', tags: '' }
    const current = { ...baseline, descriptionEn: '用户稍后填写', tags: '用户标签' }
    const result = applyAiSuggestionWithoutStaleOverwrite(current, baseline, suggestion, {
      descriptionZh: false,
      descriptionEn: true,
      tags: true,
      aliasesZh: false,
      aliasesEn: false,
    })

    expect(result.fields).toEqual(current)
    expect(result.conflicts).toEqual(['descriptionEn', 'tags'])
  })
})
