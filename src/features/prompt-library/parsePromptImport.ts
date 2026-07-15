import type { ErrorObject, ValidateFunction } from 'ajv'
import { knownCategoryIds } from './libraryCatalog'
import { parsePromptCsv } from './promptCsv'
import type { MediaType, PromptConcept } from './types'
import generatedValidateConcept from './validatePromptConcept.generated'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 500

export interface ImportIssue {
  code:
    | 'file-too-large'
    | 'invalid-utf8'
    | 'too-many-rows'
    | 'invalid-json'
    | 'invalid-csv'
    | 'invalid-package'
    | 'invalid-schema'
    | 'invalid-media'
    | 'unknown-category'
    | 'duplicate-id'
  fileName: string
  line?: number
  location?: string
  field?: string
  message: string
}

export interface ImportPreview {
  fileName: string
  candidates: PromptConcept[]
  issues: ImportIssue[]
  blocked: boolean
  summary: {
    incomingRows: number
    validRows: number
    errorCount: number
  }
}

export interface PromptImportInput {
  fileName: string
  format: 'jsonl' | 'package' | 'csv'
  bytes: Uint8Array
}

interface RecordLocation {
  line?: number
  location?: string
}

const validateConcept = generatedValidateConcept as ValidateFunction<PromptConcept>
const packageRootKeys = ['format', 'package_version', 'prompt_schema_version', 'prompts']

function schemaIssue(
  fileName: string,
  recordLocation: RecordLocation,
  error: ErrorObject,
): ImportIssue {
  const field =
    error.keyword === 'required'
      ? (error.params.missingProperty as string)
      : error.instancePath.slice(1) || undefined
  return {
    code: 'invalid-schema',
    fileName,
    ...recordLocation,
    field,
    message: field
      ? `${field} ${error.message ?? 'is invalid'}`
      : error.message || '记录不符合词条结构。',
  }
}

function emptyPreview(fileName: string, issue: ImportIssue): ImportPreview {
  return {
    fileName,
    candidates: [],
    issues: [issue],
    blocked: true,
    summary: { incomingRows: 0, validRows: 0, errorCount: 1 },
  }
}

function decodeInput(input: PromptImportInput): string | ImportPreview {
  if (input.bytes.byteLength > MAX_IMPORT_BYTES) {
    return emptyPreview(input.fileName, {
      code: 'file-too-large',
      fileName: input.fileName,
      message: `文件不能超过 ${MAX_IMPORT_BYTES} 字节。`,
    })
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input.bytes)
  } catch {
    return emptyPreview(input.fileName, {
      code: 'invalid-utf8',
      fileName: input.fileName,
      message: '文件不是有效的 UTF-8 文本。',
    })
  }
}

function acceptRecord(
  external: unknown,
  fileName: string,
  recordLocation: RecordLocation,
  preservePortableSource: boolean,
  seenIds: Map<string, RecordLocation>,
  candidates: PromptConcept[],
  issues: ImportIssue[],
): void {
  if (!validateConcept(external)) {
    issues.push(schemaIssue(fileName, recordLocation, validateConcept.errors![0]))
    return
  }
  if (external.media_types.length !== 1) {
    issues.push({
      code: 'invalid-media',
      fileName,
      ...recordLocation,
      field: 'media_types',
      message: 'media_types 必须且只能包含 image 或 video 之一。',
    })
    return
  }
  const mediaType = external.media_types[0] as MediaType
  if (!knownCategoryIds[mediaType]?.has(external.category_id)) {
    issues.push({
      code: 'unknown-category',
      fileName,
      ...recordLocation,
      field: 'category_id',
      message: 'category_id 不是该媒体类型的已知分类。',
    })
    return
  }
  const originalLocation = seenIds.get(external.id)
  if (originalLocation) {
    const original = originalLocation.location ?? `第 ${originalLocation.line} 行`
    issues.push({
      code: 'duplicate-id',
      fileName,
      ...recordLocation,
      field: 'id',
      message: `id 与 ${original} 重复。`,
    })
    return
  }
  seenIds.set(external.id, recordLocation)
  const source =
    preservePortableSource && (external.source === 'user' || external.source === 'imported')
      ? external.source
      : 'imported'
  candidates.push({ ...external, source, status: 'approved' })
}

function previewResult(
  fileName: string,
  incomingRows: number,
  candidates: PromptConcept[],
  issues: ImportIssue[],
): ImportPreview {
  return {
    fileName,
    candidates,
    issues,
    blocked: issues.length > 0,
    summary: { incomingRows, validRows: candidates.length, errorCount: issues.length },
  }
}

function parseJsonl(fileName: string, content: string): ImportPreview {
  const candidates: PromptConcept[] = []
  const issues: ImportIssue[] = []
  const seenIds = new Map<string, RecordLocation>()
  let incomingRows = 0

  for (const [index, physicalLine] of content.split(/\r?\n/).entries()) {
    if (!physicalLine.trim()) continue
    const line = index + 1
    incomingRows += 1
    if (incomingRows > MAX_IMPORT_ROWS) {
      if (!issues.some(({ code }) => code === 'too-many-rows')) {
        issues.push({
          code: 'too-many-rows',
          fileName,
          line,
          message: `最多可导入 ${MAX_IMPORT_ROWS} 行。`,
        })
      }
      continue
    }
    let external: unknown
    try {
      external = JSON.parse(physicalLine)
    } catch {
      issues.push({
        code: 'invalid-json',
        fileName,
        line,
        message: '此行不是有效的 JSON。',
      })
      continue
    }
    acceptRecord(external, fileName, { line }, false, seenIds, candidates, issues)
  }
  return previewResult(fileName, incomingRows, candidates, issues)
}

function parsePackage(fileName: string, content: string): ImportPreview {
  let root: unknown
  try {
    root = JSON.parse(content)
  } catch {
    return emptyPreview(fileName, {
      code: 'invalid-json',
      fileName,
      message: '数据包不是有效的 JSON。',
    })
  }
  if (
    typeof root !== 'object' ||
    root === null ||
    Array.isArray(root) ||
    Object.keys(root).length !== packageRootKeys.length ||
    !packageRootKeys.every((key) => Object.prototype.hasOwnProperty.call(root, key))
  ) {
    return emptyPreview(fileName, {
      code: 'invalid-package',
      fileName,
      message: '数据包根结构不受支持。',
    })
  }
  const envelope = root as Record<string, unknown>
  if (
    envelope.format !== 'promptmate.prompt-package' ||
    envelope.package_version !== 1 ||
    envelope.prompt_schema_version !== '1.0' ||
    !Array.isArray(envelope.prompts)
  ) {
    return emptyPreview(fileName, {
      code: 'invalid-package',
      fileName,
      message: '数据包格式或版本不受支持。',
    })
  }

  const candidates: PromptConcept[] = []
  const issues: ImportIssue[] = []
  const seenIds = new Map<string, RecordLocation>()
  const incomingRows = envelope.prompts.length
  envelope.prompts.slice(0, MAX_IMPORT_ROWS).forEach((external, index) => {
    const location = { location: `prompts[${index}]` }
    acceptRecord(external, fileName, location, true, seenIds, candidates, issues)
  })
  if (incomingRows > MAX_IMPORT_ROWS) {
    issues.push({
      code: 'too-many-rows',
      fileName,
      location: `prompts[${MAX_IMPORT_ROWS}]`,
      message: `最多可导入 ${MAX_IMPORT_ROWS} 条词条。`,
    })
  }
  return previewResult(fileName, incomingRows, candidates, issues)
}

function parseCsv(fileName: string, content: string): ImportPreview {
  const parsed = parsePromptCsv(content)
  const headerInvalid = parsed.issues.some(({ field }) => field === 'header')
  if (headerInvalid) {
    const issue = parsed.issues[0]
    return emptyPreview(fileName, {
      code: 'invalid-csv',
      fileName,
      line: issue.line,
      field: issue.field,
      message: issue.message,
    })
  }

  const candidates: PromptConcept[] = []
  const issues: ImportIssue[] = parsed.issues.map((issue) => ({
    code: 'invalid-csv',
    fileName,
    ...issue,
  }))
  const seenIds = new Map<string, RecordLocation>()
  const rowLines = [
    ...parsed.records.map(({ line }) => line),
    ...parsed.issues.map(({ line }) => line),
  ].sort((left, right) => left - right)
  const incomingRows = rowLines.length
  const acceptedLines = new Set(rowLines.slice(0, MAX_IMPORT_ROWS))
  parsed.records
    .filter(({ line }) => acceptedLines.has(line))
    .forEach(({ line, value }) => {
      acceptRecord(value, fileName, { line }, false, seenIds, candidates, issues)
    })
  if (incomingRows > MAX_IMPORT_ROWS) {
    issues.push({
      code: 'too-many-rows',
      fileName,
      line: rowLines[MAX_IMPORT_ROWS],
      message: `最多可导入 ${MAX_IMPORT_ROWS} 条词条。`,
    })
  }
  return previewResult(fileName, incomingRows, candidates, issues)
}

export function parsePromptImport(input: PromptImportInput): ImportPreview {
  const decoded = decodeInput(input)
  if (typeof decoded !== 'string') return decoded
  if (input.format === 'package') return parsePackage(input.fileName, decoded)
  if (input.format === 'csv') return parseCsv(input.fileName, decoded)
  return parseJsonl(input.fileName, decoded)
}
