import type { PromptConcept } from './types'

export const PROMPT_CSV_HEADER = [
  'schema_version',
  'id',
  'zh',
  'en',
  'description_zh',
  'description_en',
  'category_id',
  'tags',
  'aliases_zh',
  'aliases_en',
  'media_type',
  'source',
  'status',
] as const

const FORMULA_ESCAPE_MARKER = '\u200B'
const formulaTrigger = /^[=+\-@\t\r]/

export interface PromptCsvIssue {
  line: number
  field?: string
  message: string
}

export interface PromptCsvRecord {
  line: number
  value: unknown
}

export interface PromptCsvParseResult {
  records: PromptCsvRecord[]
  issues: PromptCsvIssue[]
}

interface CsvRow {
  line: number
  fields: string[]
}

interface CsvRowsResult {
  rows: CsvRow[]
  issues: PromptCsvIssue[]
}

export function escapeSpreadsheetCell(value: string): string {
  if (value.startsWith(FORMULA_ESCAPE_MARKER)) return `${FORMULA_ESCAPE_MARKER}${value}`
  return formulaTrigger.test(value) ? `${FORMULA_ESCAPE_MARKER}${value}` : value
}

export function unescapeSpreadsheetCell(value: string): string {
  if (!value.startsWith(FORMULA_ESCAPE_MARKER)) return value
  const remainder = value.slice(FORMULA_ESCAPE_MARKER.length)
  return remainder.startsWith(FORMULA_ESCAPE_MARKER) || formulaTrigger.test(remainder)
    ? remainder
    : value
}

function consumeNewline(content: string, index: number): number {
  return content[index] === '\r' && content[index + 1] === '\n' ? index + 2 : index + 1
}

function parseCsvRows(input: string): CsvRowsResult {
  const content = input.startsWith('\uFEFF') ? input.slice(1) : input
  const rows: CsvRow[] = []
  const issues: PromptCsvIssue[] = []
  let index = 0
  let physicalLine = 1

  while (index < content.length) {
    const startLine = physicalLine
    const fields: string[] = []
    let malformed = false
    let rowComplete = false

    while (!rowComplete) {
      let field = ''
      if (content[index] === '"') {
        index += 1
        let closed = false
        while (index < content.length) {
          const character = content[index]
          if (character === '"') {
            if (content[index + 1] === '"') {
              field += '"'
              index += 2
            } else {
              closed = true
              index += 1
              break
            }
          } else if (character === '\r' || character === '\n') {
            const next = consumeNewline(content, index)
            field += content.slice(index, next)
            index = next
            physicalLine += 1
          } else {
            field += character
            index += 1
          }
        }
        if (!closed) {
          issues.push({ line: startLine, message: '引号字段未闭合。' })
          malformed = true
          rowComplete = true
          continue
        }
        const following = content[index]
        if (
          following !== undefined &&
          following !== ',' &&
          following !== '\r' &&
          following !== '\n'
        ) {
          issues.push({
            line: startLine,
            field: PROMPT_CSV_HEADER[fields.length],
            message: '结束引号后包含无效字符。',
          })
          malformed = true
          while (index < content.length && content[index] !== '\r' && content[index] !== '\n') {
            index += 1
          }
        }
      } else {
        while (
          index < content.length &&
          content[index] !== ',' &&
          content[index] !== '\r' &&
          content[index] !== '\n'
        ) {
          if (content[index] === '"') {
            issues.push({
              line: startLine,
              field: PROMPT_CSV_HEADER[fields.length],
              message: '未加引号的字段中不能出现引号。',
            })
            malformed = true
            while (index < content.length && content[index] !== '\r' && content[index] !== '\n') {
              index += 1
            }
            break
          }
          field += content[index]
          index += 1
        }
      }

      if (!malformed) fields.push(field)
      if (content[index] === ',') {
        index += 1
        continue
      }
      if (content[index] === '\r' || content[index] === '\n') {
        index = consumeNewline(content, index)
        physicalLine += 1
      }
      rowComplete = true
    }

    if (!malformed) rows.push({ line: startLine, fields })
  }

  return { rows, issues }
}

function exactHeader(fields: string[]): boolean {
  return (
    fields.length === PROMPT_CSV_HEADER.length &&
    PROMPT_CSV_HEADER.every((expected, index) => fields[index] === expected)
  )
}

function parseStringArray(value: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

export function parsePromptCsv(content: string): PromptCsvParseResult {
  const parsed = parseCsvRows(content)
  const [header, ...dataRows] = parsed.rows
  if (!header || !exactHeader(header.fields)) {
    return {
      records: [],
      issues: [
        { line: header?.line ?? 1, field: 'header', message: 'CSV 表头必须完整且顺序固定。' },
      ],
    }
  }

  const records: PromptCsvRecord[] = []
  const issues = [...parsed.issues]
  for (const row of dataRows) {
    if (row.fields.length !== PROMPT_CSV_HEADER.length) {
      issues.push({
        line: row.line,
        message: `列数不一致：应为 ${PROMPT_CSV_HEADER.length} 列。`,
      })
      continue
    }
    const cells = row.fields.map(unescapeSpreadsheetCell)
    const tags = parseStringArray(cells[7])
    const aliasesZh = parseStringArray(cells[8])
    const aliasesEn = parseStringArray(cells[9])
    const invalidListIndex = [tags, aliasesZh, aliasesEn].findIndex((value) => value === undefined)
    if (invalidListIndex >= 0) {
      issues.push({
        line: row.line,
        field: PROMPT_CSV_HEADER[invalidListIndex + 7],
        message: '列表字段必须是仅包含字符串的 JSON 数组。',
      })
      continue
    }
    records.push({
      line: row.line,
      value: {
        schema_version: cells[0],
        id: cells[1],
        zh: cells[2],
        en: cells[3],
        description_zh: cells[4],
        description_en: cells[5],
        category_id: cells[6],
        tags,
        aliases_zh: aliasesZh,
        aliases_en: aliasesEn,
        media_types: [cells[10]],
        source: cells[11],
        status: cells[12],
      },
    })
  }
  return { records, issues }
}

function quoteCsvField(value: string): string {
  return /[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function promptCells(prompt: PromptConcept): string[] {
  return [
    prompt.schema_version,
    prompt.id,
    prompt.zh,
    prompt.en,
    prompt.description_zh,
    prompt.description_en,
    prompt.category_id,
    JSON.stringify(prompt.tags),
    JSON.stringify(prompt.aliases_zh),
    JSON.stringify(prompt.aliases_en),
    prompt.media_types[0] ?? '',
    prompt.source,
    prompt.status,
  ]
}

export function serializePromptCsv(prompts: readonly PromptConcept[]): string {
  const lines = [
    PROMPT_CSV_HEADER.join(','),
    ...prompts.map((prompt) =>
      promptCells(prompt).map(escapeSpreadsheetCell).map(quoteCsvField).join(','),
    ),
  ]
  return `${lines.join('\r\n')}\r\n`
}
