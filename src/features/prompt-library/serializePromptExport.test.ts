import { describe, expect, it } from 'vitest'
import type { MediaType, PromptConcept, PromptSource } from './types'
import {
  selectPromptExport,
  serializePromptJsonl,
  serializePromptPackage,
} from './serializePromptExport'

function prompt(id: string, media: MediaType, source: PromptSource): PromptConcept {
  return {
    schema_version: '1.0',
    id,
    zh: `${id} 中文`,
    en: `${id} English`,
    description_zh: `${id} 描述`,
    description_en: `${id} description`,
    category_id: media === 'image' ? 'people-subjects' : 'camera-movement',
    tags: ['tag'],
    aliases_zh: ['别名'],
    aliases_en: ['alias'],
    media_types: [media],
    source,
    status: 'approved',
  }
}

describe('deterministic prompt export', () => {
  it('selects requested media/source and canonically orders media, source, then code points', () => {
    const records = [
      prompt('z', 'video', 'user'),
      prompt('é', 'image', 'builtin'),
      prompt('a', 'image', 'imported'),
      prompt('Z', 'image', 'builtin'),
      prompt('b', 'video', 'ai_generated'),
      prompt('a', 'image', 'user'),
    ]

    expect(
      selectPromptExport(records.reverse(), {
        currentMedia: 'video',
        media: 'all',
        source: 'all',
      }).map(({ media_types, source, id }) => `${media_types[0]}:${source}:${id}`),
    ).toEqual([
      'image:builtin:Z',
      'image:builtin:é',
      'image:user:a',
      'image:imported:a',
      'video:user:z',
      'video:ai_generated:b',
    ])
    expect(
      selectPromptExport(records, {
        currentMedia: 'video',
        media: 'current',
        source: 'user',
      }).map(({ id }) => id),
    ).toEqual(['z'])
    expect(
      selectPromptExport(records, {
        currentMedia: 'image',
        media: 'all',
        source: 'imported',
      }).map(({ id }) => id),
    ).toEqual(['a'])
  })

  it('writes canonical JSONL with fixed properties, LF, final newline, and an empty string for no rows', () => {
    const value = prompt('alpha', 'image', 'user')
    const serialized = serializePromptJsonl([value])

    expect(serialized).toBe(
      '{"schema_version":"1.0","id":"alpha","zh":"alpha 中文","en":"alpha English","description_zh":"alpha 描述","description_en":"alpha description","category_id":"people-subjects","tags":["tag"],"aliases_zh":["别名"],"aliases_en":["alias"],"media_types":["image"],"source":"user","status":"approved"}\n',
    )
    expect(serializePromptJsonl([])).toBe('')
    expect([...new TextEncoder().encode(serialized)].slice(0, 3)).not.toEqual([239, 187, 191])
  })

  it('writes the exact deterministic PromptMate package envelope without unrelated state', () => {
    const serialized = serializePromptPackage([prompt('alpha', 'image', 'user')])

    expect(serialized).toContain(
      '{\n  "format": "promptmate.prompt-package",\n  "package_version": 1,\n  "prompt_schema_version": "1.0",\n  "prompts": [',
    )
    expect(serialized).toContain(
      '"schema_version": "1.0",\n      "id": "alpha",\n      "zh": "alpha 中文",\n      "en": "alpha English"',
    )
    expect(serialized.endsWith('\n')).toBe(true)
    expect(serializePromptPackage([])).toBe(
      '{\n  "format": "promptmate.prompt-package",\n  "package_version": 1,\n  "prompt_schema_version": "1.0",\n  "prompts": []\n}\n',
    )
  })
})
