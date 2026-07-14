import { describe, expect, it } from 'vitest'
import { parsePromptJsonl } from './parsePromptJsonl'

const validConcept = {
  schema_version: '1.0',
  id: 'soft-rim-light',
  zh: '柔和侧逆光',
  en: 'soft rim lighting',
  description_zh: '勾勒主体轮廓。',
  description_en: 'Defines the subject silhouette.',
  category_id: 'lighting',
  tags: ['人像', '电影感'],
  aliases_zh: ['轮廓光'],
  aliases_en: ['edge light'],
  media_types: ['image'],
  source: 'builtin',
  status: 'approved',
}

describe('parsePromptJsonl', () => {
  it('parses a valid concept record', () => {
    const result = parsePromptJsonl(JSON.stringify(validConcept), 'image.jsonl')

    expect(result).toEqual([validConcept])
  })

  it('reports the file and line for malformed JSON', () => {
    const content = `${JSON.stringify(validConcept)}\n{"id":`

    expect(() => parsePromptJsonl(content, 'image.jsonl')).toThrow(
      'image.jsonl:2 contains invalid JSON',
    )
  })

  it('reports a missing required field', () => {
    const invalidConcept: Partial<typeof validConcept> = { ...validConcept }
    delete invalidConcept.en

    expect(() => parsePromptJsonl(JSON.stringify(invalidConcept), 'image.jsonl')).toThrow(
      'image.jsonl:1 is invalid: missing required field "en"',
    )
  })

  it('rejects duplicate concept ids with the duplicate line number', () => {
    const content = `${JSON.stringify(validConcept)}\n${JSON.stringify(validConcept)}`

    expect(() => parsePromptJsonl(content, 'image.jsonl')).toThrow(
      'image.jsonl:2 duplicates id "soft-rim-light" from line 1',
    )
  })

  it('ignores blank lines while preserving physical line numbers', () => {
    const content = `${JSON.stringify(validConcept)}\r\n\r\n   \r\n${JSON.stringify(validConcept)}`

    expect(() => parsePromptJsonl(content, 'image.jsonl')).toThrow(
      'image.jsonl:4 duplicates id "soft-rim-light" from line 1',
    )
  })

  it('reports schema violations outside required fields', () => {
    const invalidConcept = { ...validConcept, source: 'unknown' }

    expect(() => parsePromptJsonl(JSON.stringify(invalidConcept), 'image.jsonl')).toThrow(
      'image.jsonl:1 is invalid: source must be equal to one of the allowed values',
    )
  })

  it('preserves minimum-length validation', () => {
    const invalidConcept = { ...validConcept, en: '' }

    expect(() => parsePromptJsonl(JSON.stringify(invalidConcept), 'image.jsonl')).toThrow(
      'image.jsonl:1 is invalid: en must NOT have fewer than 1 characters',
    )
  })

  it('preserves deep equality checks for unique arrays', () => {
    const invalidConcept = { ...validConcept, tags: ['电影感', '电影感'] }

    expect(() => parsePromptJsonl(JSON.stringify(invalidConcept), 'image.jsonl')).toThrow(
      'image.jsonl:1 is invalid: tags must NOT have duplicate items',
    )
  })
})
