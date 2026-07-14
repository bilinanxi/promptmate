import type { PromptConcept } from './types'

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function searchableText(prompt: PromptConcept): string {
  return [
    prompt.zh,
    prompt.en,
    prompt.description_zh,
    prompt.description_en,
    prompt.category_id,
    ...prompt.tags,
    ...prompt.aliases_zh,
    ...prompt.aliases_en,
    ...prompt.media_types,
  ]
    .map(normalize)
    .join('\n')
}

export function searchPrompts(prompts: PromptConcept[], query: string): PromptConcept[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return prompts

  return prompts.filter((prompt) => {
    const text = searchableText(prompt)
    return terms.every((term) => text.includes(term))
  })
}
