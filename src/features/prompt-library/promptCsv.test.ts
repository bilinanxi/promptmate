import { describe, expect, it } from 'vitest'
import {
  PROMPT_CSV_HEADER,
  escapeSpreadsheetCell,
  parsePromptCsv,
  serializePromptCsv,
} from './promptCsv'
import type { PromptConcept } from './types'

const header = PROMPT_CSV_HEADER.join(',')

function row(fields: string[]): string {
  return fields
    .map((field) => (/[,"\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field))
    .join(',')
}

const fields = [
  '1.0',
  'csv-one',
  '中文,名称',
  'English "name"',
  '第一行\r\n第二行',
  'English description',
  'people-subjects',
  '["标签","tag"]',
  '["别名"]',
  '["alias"]',
  'image',
  'builtin',
  'pending',
]

const prompt: PromptConcept = {
  schema_version: '1.0',
  id: 'csv-one',
  zh: '中文,名称',
  en: 'English "name"',
  description_zh: '第一行\r\n第二行',
  description_en: 'English description',
  category_id: 'people-subjects',
  tags: ['标签', 'tag'],
  aliases_zh: ['别名'],
  aliases_en: ['alias'],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

describe('strict PromptMate CSV codec', () => {
  it('parses an optional BOM, RFC quoting, escaped quotes, and embedded newlines at the logical start line', () => {
    const result = parsePromptCsv(`\uFEFF${header}\r\n${row(fields)}\r\n`)

    expect(result.issues).toEqual([])
    expect(result.records).toEqual([
      { line: 2, value: { ...prompt, source: 'builtin', status: 'pending' } },
    ])
  })

  it.each([
    ['unclosed quote', `${header}\r\n"broken`, 2],
    ['quote in an unquoted field', `${header}\r\n1.0,bad"id,x`, 2],
    ['junk after a closing quote', `${header}\r\n"1.0"junk,x`, 2],
    ['inconsistent columns', `${header}\r\n1.0,only-two`, 2],
  ])('rejects %s and reports the physical row start', (_label, csv, line) => {
    const result = parsePromptCsv(csv)

    expect(result.records).toEqual([])
    expect(result.issues[0]).toEqual(expect.objectContaining({ line }))
  })

  it.each([
    ['missing', PROMPT_CSV_HEADER.slice(1)],
    ['extra', [...PROMPT_CSV_HEADER, 'extra']],
    ['reordered', [PROMPT_CSV_HEADER[1], PROMPT_CSV_HEADER[0], ...PROMPT_CSV_HEADER.slice(2)]],
    ['duplicate', [...PROMPT_CSV_HEADER.slice(0, -1), PROMPT_CSV_HEADER[0]]],
    ['unknown', [...PROMPT_CSV_HEADER.slice(0, -1), 'mystery']],
  ])('fails closed for a %s header', (_label, columns) => {
    const result = parsePromptCsv(`${columns.join(',')}\r\n${row(fields)}\r\n`)

    expect(result.records).toEqual([])
    expect(result.issues).toEqual([expect.objectContaining({ line: 1, field: 'header' })])
  })
})

describe('secure deterministic PromptMate CSV export', () => {
  it('uses fixed columns, CRLF with a final terminator, no BOM, and round trips exact ordinary content', () => {
    const csv = serializePromptCsv([prompt])

    expect(csv.startsWith(`${header}\r\n`)).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).not.toMatch(/(?<!\r)\n/)
    expect([...new TextEncoder().encode(csv)].slice(0, 3)).not.toEqual([239, 187, 191])
    expect(parsePromptCsv(csv)).toEqual({ records: [{ line: 2, value: prompt }], issues: [] })
    expect(serializePromptCsv([])).toBe(`${header}\r\n`)
  })

  it('reversibly protects formula triggers and genuine marker prefixes in every emitted data cell', () => {
    const dangerous = {
      ...prompt,
      id: '=cmd',
      zh: '+plus',
      en: '-minus',
      description_zh: '@mention',
      description_en: '\ttab',
      category_id: '\rcarriage',
      tags: ['=tag'],
      aliases_zh: ['\u200Bgenuine'],
    }
    const markerPrefixed = {
      ...prompt,
      id: 'marker-prefixed',
      description_en: '\u200Bgenuine',
    }
    const csv = serializePromptCsv([dangerous, markerPrefixed])
    const parsed = parsePromptCsv(csv)

    expect(parsed.records.map(({ value }) => value)).toEqual([dangerous, markerPrefixed])
    expect(escapeSpreadsheetCell('=cmd')).toBe('\u200B=cmd')
    expect(escapeSpreadsheetCell('\u200Bgenuine')).toBe('\u200B\u200Bgenuine')
    const physicalData = csv.split('\r\n')[1]
    expect(physicalData).not.toMatch(/(?:^|,)[=+\-@\t\r]/)
  })
})
