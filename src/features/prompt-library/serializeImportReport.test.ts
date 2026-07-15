import { describe, expect, it } from 'vitest'
import { parsePromptImport } from './parsePromptImport'
import { planPromptImport } from './planPromptImport'
import { makeImportReportFileName, serializeImportReport } from './serializeImportReport'
import type { PromptConcept } from './types'

const candidate: PromptConcept = {
  schema_version: '1.0',
  id: 'incoming-secret-test',
  zh: '候选词条',
  en: 'Candidate Prompt',
  description_zh: 'SECRET_DESCRIPTION',
  description_en: 'PASSWORD=hunter2',
  category_id: 'people-subjects',
  tags: ['PRIVATE_TAG'],
  aliases_zh: ['PRIVATE_ALIAS'],
  aliases_en: [],
  media_types: ['image'],
  source: 'imported',
  status: 'approved',
}

const target: PromptConcept = {
  ...candidate,
  description_zh: 'TARGET_SECRET',
  tags: ['TARGET_PRIVATE'],
  aliases_zh: [],
  source: 'user',
}

const encoder = new TextEncoder()

describe('serializeImportReport', () => {
  it('uses an exact deterministic envelope and excludes prompt details and app secrets', () => {
    const preview = {
      fileName: '../private/community.jsonl',
      candidates: [candidate],
      issues: [
        {
          code: 'invalid-json' as const,
          fileName: '../private/community.jsonl',
          line: 7,
          location: 'records[6]',
          field: 'id',
          message: '此行不是有效的 JSON。',
        },
      ],
      blocked: true,
      summary: { incomingRows: 2, validRows: 1, errorCount: 1 },
    }
    const plan = planPromptImport({
      incoming: [candidate],
      managed: [target],
      builtins: [],
      policy: 'skip',
    })

    const first = serializeImportReport({ preview, plan })
    const second = serializeImportReport({ preview, plan })

    expect(second).toBe(first)
    expect(first).toBe(
      `${JSON.stringify(
        {
          format: 'promptmate.import-report',
          report_version: 1,
          file_name: '../private/community.jsonl',
          summary: {
            incoming_rows: 2,
            valid_rows: 1,
            parser_issue_count: 1,
            add_count: 0,
            skip_count: 1,
            replace_count: 0,
            copy_count: 0,
            blocked_count: 0,
            changed_count: 0,
            import_after_total: 1,
            transaction_blocked: true,
          },
          parser_issues: [
            {
              code: 'invalid-json',
              line: 7,
              location: 'records[6]',
              field: 'id',
              message: '此行不是有效的 JSON。',
            },
          ],
          plan_rows: [
            {
              candidate: {
                id: 'incoming-secret-test',
                zh: '候选词条',
                en: 'Candidate Prompt',
                media_type: 'image',
              },
              result: 'skip',
              reason: null,
              target: {
                scope: 'managed',
                id: 'incoming-secret-test',
                zh: '候选词条',
                en: 'Candidate Prompt',
              },
              conflict_kinds: ['en', 'id', 'zh'],
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
    expect(first).not.toContain('SECRET_DESCRIPTION')
    expect(first).not.toContain('hunter2')
    expect(first).not.toContain('PRIVATE_TAG')
    expect(first).not.toContain('TARGET_SECRET')
    expect(first).not.toContain('localStorage')
  })

  it('keeps every malformed JSONL and CSV parser issue in input order', () => {
    const jsonl = parsePromptImport({
      fileName: 'bad.jsonl',
      format: 'jsonl',
      bytes: encoder.encode('{bad}\n[]\n{also bad}\n'),
    })
    const csv = parsePromptImport({
      fileName: 'bad.csv',
      format: 'csv',
      bytes: encoder.encode('wrong,header\r\n1,2\r\n'),
    })

    for (const preview of [jsonl, csv]) {
      const plan = planPromptImport({ incoming: preview.candidates, managed: [], builtins: [] })
      const report = JSON.parse(serializeImportReport({ preview, plan }))
      expect(report.parser_issues).toHaveLength(preview.issues.length)
      expect(report.parser_issues.map((issue: { code: string }) => issue.code)).toEqual(
        preview.issues.map(({ code }) => code),
      )
      expect(report.parser_issues.every((issue: object) => !('fileName' in issue))).toBe(true)
    }
    expect(jsonl.issues.length).toBeGreaterThan(1)
  })

  it('normalizes download names to a safe basename with a deterministic fallback', () => {
    expect(makeImportReportFileName('C:\\private\\..\\community.promptmate.json')).toBe(
      'community.import-report.json',
    )
    expect(makeImportReportFileName('../../folder/evil\u0000.jsonl')).toBe(
      'evil.import-report.json',
    )
    expect(makeImportReportFileName('..\\\u0001/')).toBe('prompt-import.import-report.json')
  })
})
