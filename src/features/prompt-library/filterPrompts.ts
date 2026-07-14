import { searchPrompts } from './searchPrompts'
import type { PromptConcept, PromptSource } from './types'

export interface PromptFilters {
  query?: string
  categoryId?: string
  tag?: string
  source?: PromptSource
}

export function filterPrompts(
  prompts: PromptConcept[],
  { query = '', categoryId, tag, source }: PromptFilters,
): PromptConcept[] {
  const searched = searchPrompts(prompts, query)
  if (!categoryId && !tag && !source) return searched

  return searched.filter(
    (prompt) =>
      (!categoryId || prompt.category_id === categoryId) &&
      (!tag || prompt.tags.includes(tag)) &&
      (!source || prompt.source === source),
  )
}
