import { describe, expect, it } from 'vitest'
import type { PromptConcept } from './types'
import {
  USER_PROMPTS_STORAGE_KEY,
  loadUserPrompts,
  makeUserPromptId,
  saveUserPrompts,
} from './userPromptStorage'

const imagePrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'user-soft-portrait',
  zh: '柔和肖像',
  en: 'soft portrait',
  description_zh: '柔和自然的人像画面',
  description_en: 'a soft natural portrait',
  category_id: 'people-subjects',
  tags: ['人像'],
  aliases_zh: ['自然肖像'],
  aliases_en: ['natural portrait'],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

const importedPrompt: PromptConcept = {
  ...imagePrompt,
  id: 'community-soft-portrait',
  source: 'imported',
}

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    read: () => value,
  }
}

describe('user prompt storage', () => {
  it('saves an exact v2 payload and roundtrips user and imported managed prompts', () => {
    const storage = memoryStorage()

    expect(saveUserPrompts(storage, [imagePrompt, importedPrompt])).toBe(true)
    expect(JSON.parse(storage.read()!)).toEqual({
      version: 2,
      prompts: [imagePrompt, importedPrompt],
    })
    expect(loadUserPrompts(storage)).toEqual([imagePrompt, importedPrompt])
    expect(USER_PROMPTS_STORAGE_KEY).toBe('promptmate:user-prompts')
  })

  it('loads a legacy exact v1 user payload without rewriting it', () => {
    const serialized = JSON.stringify({ version: 1, prompts: [imagePrompt] })
    const storage = memoryStorage(serialized)

    expect(loadUserPrompts(storage)).toEqual([imagePrompt])
    expect(storage.read()).toBe(serialized)
  })

  it('roundtrips a schema-complete prompt with empty optional descriptions and metadata', () => {
    const storage = memoryStorage()
    const minimalPrompt: PromptConcept = {
      ...imagePrompt,
      description_zh: '',
      description_en: '',
      tags: [],
      aliases_zh: [],
      aliases_en: [],
    }

    expect(saveUserPrompts(storage, [minimalPrompt])).toBe(true)
    expect(loadUserPrompts(storage)).toEqual([minimalPrompt])
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong root', '[]'],
    ['wrong version', JSON.stringify({ version: 3, prompts: [] })],
    ['imported source in legacy v1', JSON.stringify({ version: 1, prompts: [importedPrompt] })],
    [
      'unsupported source in v2',
      JSON.stringify({ version: 2, prompts: [{ ...imagePrompt, source: 'ai_generated' }] }),
    ],
    ['extra root property', JSON.stringify({ version: 1, prompts: [], extra: true })],
    ['schema-invalid prompt', JSON.stringify({ version: 1, prompts: [{ id: 'bad' }] })],
    [
      'non-user source',
      JSON.stringify({ version: 1, prompts: [{ ...imagePrompt, source: 'builtin' }] }),
    ],
    [
      'non-approved status',
      JSON.stringify({ version: 1, prompts: [{ ...imagePrompt, status: 'pending' }] }),
    ],
    [
      'multiple media types',
      JSON.stringify({
        version: 1,
        prompts: [{ ...imagePrompt, media_types: ['image', 'video'] }],
      }),
    ],
    [
      'unknown category for media',
      JSON.stringify({ version: 1, prompts: [{ ...imagePrompt, category_id: 'camera-movement' }] }),
    ],
    [
      'duplicate IDs',
      JSON.stringify({ version: 1, prompts: [imagePrompt, { ...imagePrompt, zh: '另一个' }] }),
    ],
    [
      'more than 500 prompts',
      JSON.stringify({
        version: 1,
        prompts: Array.from({ length: 501 }, (_, index) => ({
          ...imagePrompt,
          id: `user-${index}`,
        })),
      }),
    ],
  ])('fails closed for %s', (_label, serialized) => {
    expect(loadUserPrompts(memoryStorage(serialized))).toEqual([])
  })

  it.each([
    ['non-approved imported prompt', [{ ...importedPrompt, status: 'pending' }]],
    ['multiple media types', [{ ...importedPrompt, media_types: ['image', 'video'] }]],
    ['unknown category', [{ ...importedPrompt, category_id: 'camera-movement' }]],
    ['duplicate IDs', [importedPrompt, { ...importedPrompt, zh: '另一个社区词条' }]],
    ['builtin collision', [{ ...importedPrompt, id: 'young-woman' }]],
    [
      'more than 500 combined prompts',
      Array.from({ length: 501 }, (_, index) => ({
        ...importedPrompt,
        id: `community-${index}`,
      })),
    ],
  ])('fails closed for v2 %s', (_label, prompts) => {
    const serialized = JSON.stringify({ version: 2, prompts })
    expect(loadUserPrompts(memoryStorage(serialized))).toEqual([])
  })

  it.each([
    ['image', { ...imagePrompt, id: 'young-woman' }],
    [
      'video',
      {
        ...imagePrompt,
        id: 'slow-push-in',
        category_id: 'camera-movement',
        media_types: ['video'],
      },
    ],
  ])('fails closed for a user prompt colliding with a real %s builtin ID', (_media, prompt) => {
    const serialized = JSON.stringify({ version: 1, prompts: [prompt] })

    expect(loadUserPrompts(memoryStorage(serialized))).toEqual([])
  })

  it('fails closed when storage reads throw', () => {
    expect(
      loadUserPrompts({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toEqual([])
  })

  it.each([
    ['schema-invalid prompt', [{ ...imagePrompt, zh: '' }]],
    ['non-user invariant', [{ ...imagePrompt, source: 'builtin' }]],
    [
      'too many prompts',
      Array.from({ length: 501 }, (_, index) => ({ ...imagePrompt, id: `user-${index}` })),
    ],
    ['duplicate IDs', [imagePrompt, { ...imagePrompt, zh: '另一个' }]],
    ['image builtin ID collision', [{ ...imagePrompt, id: 'young-woman' }]],
    [
      'video builtin ID collision',
      [
        {
          ...imagePrompt,
          id: 'slow-push-in',
          category_id: 'camera-movement',
          media_types: ['video'],
        },
      ],
    ],
  ])('refuses to persist %s', (_label, prompts) => {
    let writeCount = 0
    const storage = {
      setItem: () => {
        writeCount += 1
      },
    }

    expect(saveUserPrompts(storage, prompts as PromptConcept[])).toBe(false)
    expect(writeCount).toBe(0)
  })

  it('returns false when storage writes throw', () => {
    expect(
      saveUserPrompts(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        [imagePrompt],
      ),
    ).toBe(false)
  })

  it('uses locale-independent ASCII casing in generated IDs', () => {
    expect(makeUserPromptId('INDIGO IMAGE', new Set())).toBe('user-indigo-image')
  })

  it('makes normalized user IDs and probes collisions across caller-provided IDs', () => {
    expect(makeUserPromptId('  Crème brûlée! Portrait  ', new Set())).toBe(
      'user-creme-brulee-portrait',
    )
    expect(makeUserPromptId('!!!', new Set())).toBe('user-prompt')
    expect(
      makeUserPromptId(
        'Crème brûlée! Portrait',
        new Set(['user-creme-brulee-portrait', 'user-creme-brulee-portrait-2']),
      ),
    ).toBe('user-creme-brulee-portrait-3')
  })
})
