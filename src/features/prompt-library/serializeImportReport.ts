import type { ImportPreview } from './parsePromptImport'
import type { ImportConflictKind, PromptImportPlan } from './planPromptImport'

export interface SerializeImportReportInput {
  preview: ImportPreview
  plan: PromptImportPlan
}

const knownImportSuffix = /(?:\.promptmate\.json|\.jsonl|\.csv)$/i

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && (codePoint < 127 || codePoint > 159)
    })
    .join('')
}

export function makeImportReportFileName(fileName: string): string {
  const basename = stripControlCharacters(fileName).split(/[\\/]/).pop() ?? ''
  const safeBase = basename
    .replace(knownImportSuffix, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/^\.+|[. ]+$/g, '')
    .trim()
  return `${safeBase || 'prompt-import'}.import-report.json`
}

export function serializeImportReport({ preview, plan }: SerializeImportReportInput): string {
  const envelope = {
    format: 'promptmate.import-report',
    report_version: 1,
    file_name: preview.fileName,
    summary: {
      incoming_rows: preview.summary.incomingRows,
      valid_rows: preview.summary.validRows,
      parser_issue_count: preview.issues.length,
      add_count: plan.counts.add,
      skip_count: plan.counts.skip,
      replace_count: plan.counts.replace,
      copy_count: plan.counts.copy,
      blocked_count: plan.counts.blocked,
      changed_count: plan.changedCount,
      import_after_total: plan.importAfterTotal,
      transaction_blocked: preview.blocked || plan.blocked,
    },
    parser_issues: preview.issues.map(({ code, line, location, field, message }) => ({
      code,
      line,
      location,
      field,
      message,
    })),
    plan_rows: plan.rows.map(({ candidate, result, reason, target, conflicts }) => ({
      candidate: {
        id: candidate.id,
        zh: candidate.zh,
        en: candidate.en,
        media_type: candidate.media_types[0],
      },
      result,
      reason: reason ?? null,
      target: target
        ? {
            scope: target.scope,
            id: target.prompt.id,
            zh: target.prompt.zh,
            en: target.prompt.en,
          }
        : null,
      conflict_kinds: [
        ...new Set(conflicts.map(({ kind }) => kind)),
      ].sort() as ImportConflictKind[],
    })),
  }

  return `${JSON.stringify(envelope, null, 2)}\n`
}
