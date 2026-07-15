import type { MediaType, PromptConcept, PromptSource } from './types'

export type ExportMediaScope = 'current' | 'all'
export type ExportSourceScope = 'all' | 'user' | 'imported'

export interface PromptExportScope {
  currentMedia: MediaType
  media: ExportMediaScope
  source: ExportSourceScope
}

const mediaOrder: Record<MediaType, number> = { image: 0, video: 1 }
const sourceOrder: Record<PromptSource, number> = {
  builtin: 0,
  user: 1,
  imported: 2,
  ai_generated: 3,
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index] - rightPoints[index]
    if (difference) return difference
  }
  return leftPoints.length - rightPoints.length
}

function canonicalPrompt(prompt: PromptConcept): PromptConcept {
  return {
    schema_version: prompt.schema_version,
    id: prompt.id,
    zh: prompt.zh,
    en: prompt.en,
    description_zh: prompt.description_zh,
    description_en: prompt.description_en,
    category_id: prompt.category_id,
    tags: [...prompt.tags],
    aliases_zh: [...prompt.aliases_zh],
    aliases_en: [...prompt.aliases_en],
    media_types: [...prompt.media_types],
    source: prompt.source,
    status: prompt.status,
  }
}

export function selectPromptExport(
  prompts: readonly PromptConcept[],
  scope: PromptExportScope,
): PromptConcept[] {
  return prompts
    .filter(
      (prompt) =>
        (scope.media === 'all' || prompt.media_types[0] === scope.currentMedia) &&
        (scope.source === 'all' || prompt.source === scope.source),
    )
    .sort((left, right) => {
      const mediaDifference =
        mediaOrder[left.media_types[0] as MediaType] - mediaOrder[right.media_types[0] as MediaType]
      if (mediaDifference) return mediaDifference
      const sourceDifference = sourceOrder[left.source] - sourceOrder[right.source]
      return sourceDifference || compareCodePoints(left.id, right.id)
    })
    .map(canonicalPrompt)
}

export function serializePromptJsonl(prompts: readonly PromptConcept[]): string {
  if (!prompts.length) return ''
  return `${prompts.map((prompt) => JSON.stringify(canonicalPrompt(prompt))).join('\n')}\n`
}

export function serializePromptPackage(prompts: readonly PromptConcept[]): string {
  const envelope = {
    format: 'promptmate.prompt-package',
    package_version: 1,
    prompt_schema_version: '1.0',
    prompts: prompts.map(canonicalPrompt),
  }
  return `${JSON.stringify(envelope, null, 2)}\n`
}
