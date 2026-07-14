export type MediaType = 'image' | 'video'
export type PromptSource = 'builtin' | 'user' | 'imported' | 'ai_generated'
export type PromptStatus = 'approved' | 'pending' | 'rejected'

export interface PromptConcept {
  schema_version: '1.0'
  id: string
  zh: string
  en: string
  description_zh: string
  description_en: string
  category_id: string
  tags: string[]
  aliases_zh: string[]
  aliases_en: string[]
  media_types: MediaType[]
  source: PromptSource
  status: PromptStatus
}
