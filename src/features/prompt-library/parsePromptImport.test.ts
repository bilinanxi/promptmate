import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parsePromptImport } from './parsePromptImport'

const encoder = new TextEncoder()
const validExternalRecord = {
  schema_version: '1.0',
  id: 'community-rim-light',
  zh: '社区轮廓光',
  en: 'community rim light',
  description_zh: '勾勒主体轮廓。',
  description_en: 'Defines the subject silhouette.',
  category_id: 'lighting-atmosphere',
  tags: ['人像', '电影感'],
  aliases_zh: ['边缘光'],
  aliases_en: ['edge light'],
  media_types: ['image'],
  source: 'builtin',
  status: 'pending',
}

function parse(content: string) {
  return parsePromptImport({
    fileName: 'community.jsonl',
    format: 'jsonl',
    bytes: encoder.encode(content),
  })
}

function parsePackage(value: unknown) {
  return parsePromptImport({
    fileName: 'community.promptmate.json',
    format: 'package',
    bytes: encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)),
  })
}

function promptPackage(prompts: unknown[], extra: Record<string, unknown> = {}) {
  return {
    format: 'promptmate.prompt-package',
    package_version: 1,
    prompt_schema_version: '1.0',
    prompts,
    ...extra,
  }
}

describe('parsePromptImport JSONL', () => {
  it('normalizes a schema-complete external row to an approved imported candidate', () => {
    const preview = parse(JSON.stringify(validExternalRecord))

    expect(preview.issues).toEqual([])
    expect(preview.blocked).toBe(false)
    expect(preview.candidates).toEqual([
      { ...validExternalRecord, source: 'imported', status: 'approved' },
    ])
    expect(preview.summary).toEqual({ incomingRows: 1, validRows: 1, errorCount: 0 })
  })

  it('collects malformed and business errors with physical lines while retaining valid rows', () => {
    const unknownCategory = { ...validExternalRecord, id: 'unknown-category', category_id: 'nope' }
    const content = [
      JSON.stringify(validExternalRecord),
      '',
      '{"id":',
      '   ',
      JSON.stringify(unknownCategory),
    ].join('\n')

    const preview = parse(content)

    expect(preview.candidates).toHaveLength(1)
    expect(preview.blocked).toBe(true)
    expect(preview.issues).toEqual([
      expect.objectContaining({ code: 'invalid-json', fileName: 'community.jsonl', line: 3 }),
      expect.objectContaining({ code: 'unknown-category', fileName: 'community.jsonl', line: 5 }),
    ])
    expect(preview.summary).toEqual({ incomingRows: 3, validRows: 1, errorCount: 2 })
  })

  it('blocks files larger than 5 MiB before decoding rows', () => {
    const preview = parsePromptImport({
      fileName: 'too-large.jsonl',
      format: 'jsonl',
      bytes: new Uint8Array(MAX_IMPORT_BYTES + 1),
    })

    expect(preview.candidates).toEqual([])
    expect(preview.issues).toEqual([
      expect.objectContaining({ code: 'file-too-large', fileName: 'too-large.jsonl' }),
    ])
    expect(preview.blocked).toBe(true)
  })

  it('collects at most 500 incoming nonblank rows', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
      JSON.stringify({ ...validExternalRecord, id: `community-${index}` }),
    )
    const preview = parse(rows.join('\n'))

    expect(preview.candidates).toHaveLength(MAX_IMPORT_ROWS)
    expect(preview.issues).toEqual([
      expect.objectContaining({ code: 'too-many-rows', line: MAX_IMPORT_ROWS + 1 }),
    ])
    expect(preview.summary).toEqual({
      incomingRows: MAX_IMPORT_ROWS + 1,
      validRows: MAX_IMPORT_ROWS,
      errorCount: 1,
    })
  })
})

describe('parsePromptImport PromptMate package', () => {
  it('preserves portable managed sources while approving rows and normalizing privileged sources', () => {
    const preview = parsePackage(
      promptPackage([
        { ...validExternalRecord, id: 'mine', source: 'user' },
        { ...validExternalRecord, id: 'shared', source: 'imported' },
        { ...validExternalRecord, id: 'builtin', source: 'builtin' },
        { ...validExternalRecord, id: 'generated', source: 'ai_generated' },
      ]),
    )

    expect(preview.issues).toEqual([])
    expect(preview.candidates.map(({ source, status }) => ({ source, status }))).toEqual([
      { source: 'user', status: 'approved' },
      { source: 'imported', status: 'approved' },
      { source: 'imported', status: 'approved' },
      { source: 'imported', status: 'approved' },
    ])
    expect(preview.summary).toEqual({ incomingRows: 4, validRows: 4, errorCount: 0 })
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong format', { ...promptPackage([]), format: 'other' }],
    ['wrong package version', { ...promptPackage([]), package_version: 2 }],
    ['wrong schema version', { ...promptPackage([]), prompt_schema_version: '2.0' }],
    ['extra root property', promptPackage([], { favorites: [] })],
    ['non-array prompts', { ...promptPackage([]), prompts: {} }],
  ])('fails closed for %s', (_label, value) => {
    const preview = parsePackage(value)

    expect(preview.blocked).toBe(true)
    expect(preview.candidates).toEqual([])
    expect(preview.issues).toHaveLength(1)
  })

  it('collects row issues using prompts[index] locations', () => {
    const preview = parsePackage(
      promptPackage([
        validExternalRecord,
        { ...validExternalRecord, id: 'unknown', category_id: 'nope' },
        { ...validExternalRecord, id: 'duplicate' },
        { ...validExternalRecord, id: 'duplicate' },
      ]),
    )

    expect(preview.candidates).toHaveLength(2)
    expect(preview.issues).toEqual([
      expect.objectContaining({ code: 'unknown-category', location: 'prompts[1]' }),
      expect.objectContaining({ code: 'duplicate-id', location: 'prompts[3]' }),
    ])
    expect(preview.blocked).toBe(true)
  })
})
