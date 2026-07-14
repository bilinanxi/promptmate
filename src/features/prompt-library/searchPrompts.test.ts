import { describe, expect, it, vi } from 'vitest'
import type { PromptConcept } from './types'
import { searchPrompts } from './searchPrompts'

const prompts: PromptConcept[] = [
  {
    schema_version: '1.0',
    id: 'neon-rain',
    zh: '霓虹雨夜街道',
    en: 'neon-lit rainy street',
    description_zh: '湿润路面的电影氛围。',
    description_en: 'A cinematic mood on wet pavement.',
    category_id: 'scene-environment',
    tags: ['电影感', '城市'],
    aliases_zh: ['霓虹雨街'],
    aliases_en: ['rainy neon street'],
    media_types: ['image'],
    source: 'builtin',
    status: 'approved',
  },
  {
    schema_version: '1.0',
    id: 'rim-light',
    zh: '柔和侧逆光',
    en: 'soft rim lighting',
    description_zh: '勾勒主体轮廓。',
    description_en: 'Defines the subject silhouette.',
    category_id: 'lighting-atmosphere',
    tags: ['灯光', '人像'],
    aliases_zh: ['轮廓光'],
    aliases_en: ['edge light'],
    media_types: ['image'],
    source: 'builtin',
    status: 'approved',
  },
]

describe('searchPrompts', () => {
  it.each([
    ['霓虹雨夜', 'neon-rain'],
    ['RAINY NEON', 'neon-rain'],
    ['湿润路面', 'neon-rain'],
    ['cinematic mood', 'neon-rain'],
    ['电影感', 'neon-rain'],
    ['scene-environment', 'neon-rain'],
    ['轮廓光', 'rim-light'],
    ['edge light', 'rim-light'],
  ])('matches searchable prompt metadata for %s', (query, expectedId) => {
    expect(searchPrompts(prompts, query).map(({ id }) => id)).toEqual([expectedId])
  })

  it('matches every whitespace-separated term regardless of field order', () => {
    expect(searchPrompts(prompts, 'street rainy').map(({ id }) => id)).toEqual(['neon-rain'])
  })

  it('normalizes case independently of the browser locale', () => {
    const localeLower = vi
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockImplementation(function (this: string) {
        return this.replaceAll('I', 'ı').toLowerCase()
      })

    try {
      expect(searchPrompts(prompts, 'IMAGE').map(({ id }) => id)).toEqual([
        'neon-rain',
        'rim-light',
      ])
    } finally {
      localeLower.mockRestore()
    }
  })

  it('returns the complete library for a blank query', () => {
    expect(searchPrompts(prompts, '   ')).toEqual(prompts)
  })
})
