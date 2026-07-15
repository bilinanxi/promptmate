import type { ValidateFunction } from 'ajv'
import { builtinPromptsByMedia } from './builtinPrompts'
import { knownCategoryIds } from './libraryCatalog'
import type { MediaType, PromptConcept } from './types'
import generatedValidateConcept from './validatePromptConcept.generated'

export const USER_PROMPTS_STORAGE_KEY = 'promptmate:user-prompts'
export const MAX_USER_PROMPTS = 500

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter {
  setItem(key: string, value: string): void
}

const validateConcept = generatedValidateConcept as ValidateFunction<PromptConcept>
const builtinPromptIds = new Set(
  (['image', 'video'] as const).flatMap((mediaType) =>
    builtinPromptsByMedia[mediaType].map(({ id }) => id),
  ),
)

function isValidManagedPromptList(
  value: unknown,
  allowedSources: ReadonlySet<PromptConcept['source']>,
): value is PromptConcept[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_USER_PROMPTS ||
    !value.every((prompt) => validateConcept(prompt))
  ) {
    return false
  }

  const prompts = value as PromptConcept[]
  return (
    !prompts.some((prompt) => {
      if (
        !allowedSources.has(prompt.source) ||
        prompt.status !== 'approved' ||
        prompt.media_types.length !== 1
      ) {
        return true
      }
      return !knownCategoryIds[prompt.media_types[0] as MediaType].has(prompt.category_id)
    }) &&
    new Set(prompts.map(({ id }) => id)).size === prompts.length &&
    !prompts.some(({ id }) => builtinPromptIds.has(id))
  )
}

export function makeUserPromptId(englishName: string, occupiedIds: ReadonlySet<string>): string {
  const slug = englishName
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = `user-${slug || 'prompt'}`
  if (!occupiedIds.has(base)) return base

  let suffix = 2
  while (occupiedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function loadUserPrompts(storage: StorageReader): PromptConcept[] {
  try {
    const raw = storage.getItem(USER_PROMPTS_STORAGE_KEY)
    if (raw === null) return []

    const payload: unknown = JSON.parse(raw)
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(payload, 'version') ||
      !Object.prototype.hasOwnProperty.call(payload, 'prompts')
    ) {
      return []
    }

    const candidate = payload as { version: unknown; prompts: unknown }
    const allowedSources =
      candidate.version === 1
        ? new Set<PromptConcept['source']>(['user'])
        : candidate.version === 2
          ? new Set<PromptConcept['source']>(['user', 'imported'])
          : null
    if (!allowedSources || !isValidManagedPromptList(candidate.prompts, allowedSources)) {
      return []
    }

    return candidate.prompts
  } catch {
    return []
  }
}

export function saveUserPrompts(storage: StorageWriter, prompts: PromptConcept[]): boolean {
  if (!isValidManagedPromptList(prompts, new Set<PromptConcept['source']>(['user', 'imported'])))
    return false

  try {
    storage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 2, prompts }))
    return true
  } catch {
    return false
  }
}
