import { MAX_USER_PROMPTS } from './userPromptStorage'
import type { PromptConcept } from './types'

export type ImportConflictPolicy = 'skip' | 'replace' | 'copy'
export type ImportPlanResult = 'add' | 'skip' | 'replace' | 'copy' | 'blocked'
export type ImportConflictKind = 'id' | 'zh' | 'en'

export interface ImportConflictTarget {
  scope: 'builtin' | 'managed' | 'incoming'
  prompt: PromptConcept
}

export interface ImportPlanRow {
  candidate: PromptConcept
  result: ImportPlanResult
  target?: ImportConflictTarget
  conflicts: ReadonlyArray<{
    kind: ImportConflictKind
    target: ImportConflictTarget
  }>
  plannedPrompt?: PromptConcept
  reason?: 'ambiguous' | 'builtin-replace' | 'media-change' | 'incoming-replace' | 'limit'
}

export interface PromptImportPlan {
  rows: ReadonlyArray<ImportPlanRow>
  counts: Record<ImportPlanResult, number>
  changedCount: number
  importAfterTotal: number
  blocked: boolean
  finalPrompts: ReadonlyArray<PromptConcept> | null
}

export interface PlanPromptImportInput {
  incoming: readonly PromptConcept[]
  managed: readonly PromptConcept[]
  builtins: readonly PromptConcept[]
  policy?: ImportConflictPolicy
  maxManaged?: number
}

function sameMedia(left: PromptConcept, right: PromptConcept) {
  return left.media_types[0] === right.media_types[0]
}

function conflictsWith(candidate: PromptConcept, target: ImportConflictTarget) {
  const conflicts: ImportPlanRow['conflicts'][number][] = []
  if (candidate.id === target.prompt.id) conflicts.push({ kind: 'id', target })
  if (sameMedia(candidate, target.prompt) && candidate.zh.trim() === target.prompt.zh.trim()) {
    conflicts.push({ kind: 'zh', target })
  }
  if (
    sameMedia(candidate, target.prompt) &&
    candidate.en.trim().toLowerCase() === target.prompt.en.trim().toLowerCase()
  ) {
    conflicts.push({ kind: 'en', target })
  }
  return conflicts
}

function makeImportedCopyId(englishName: string, occupiedIds: ReadonlySet<string>) {
  const slug = englishName
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = `imported-${slug || 'prompt'}`
  if (!occupiedIds.has(base)) return base
  let suffix = 2
  while (occupiedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function planPromptImport({
  incoming,
  managed,
  builtins,
  policy = 'skip',
  maxManaged = MAX_USER_PROMPTS,
}: PlanPromptImportInput): PromptImportPlan {
  const working = managed.map((prompt) => ({ ...prompt }))
  const acceptedIncoming: ImportConflictTarget[] = []
  const rows: ImportPlanRow[] = []
  const counts: Record<ImportPlanResult, number> = {
    add: 0,
    skip: 0,
    replace: 0,
    copy: 0,
    blocked: 0,
  }

  for (const candidate of incoming) {
    const targets: ImportConflictTarget[] = [
      ...builtins.map((prompt) => ({ scope: 'builtin' as const, prompt })),
      ...working.slice(0, managed.length).map((prompt) => ({ scope: 'managed' as const, prompt })),
      ...acceptedIncoming,
    ]
    const conflicts = targets.flatMap((target) => conflictsWith(candidate, target))
    const distinctTargets = [...new Set(conflicts.map(({ target }) => target))]

    let row: ImportPlanRow
    if (!conflicts.length) {
      if (working.length >= maxManaged) {
        row = { candidate, result: 'blocked', conflicts, reason: 'limit' }
      } else {
        const plannedPrompt = {
          ...candidate,
          source: candidate.source,
          status: 'approved' as const,
        }
        working.push(plannedPrompt)
        acceptedIncoming.push({ scope: 'incoming', prompt: plannedPrompt })
        row = { candidate, result: 'add', conflicts, plannedPrompt }
      }
    } else if (distinctTargets.length > 1) {
      row = { candidate, result: 'blocked', conflicts, reason: 'ambiguous' }
    } else if (policy === 'skip') {
      row = { candidate, result: 'skip', target: distinctTargets[0], conflicts }
    } else if (policy === 'copy') {
      if (working.length >= maxManaged) {
        row = {
          candidate,
          result: 'blocked',
          target: distinctTargets[0],
          conflicts,
          reason: 'limit',
        }
      } else {
        const occupiedIds = new Set([
          ...builtins.map(({ id }) => id),
          ...working.map(({ id }) => id),
        ])
        const plannedPrompt: PromptConcept = {
          ...candidate,
          id: makeImportedCopyId(candidate.en, occupiedIds),
          source: candidate.source,
          status: 'approved',
        }
        working.push(plannedPrompt)
        acceptedIncoming.push({ scope: 'incoming', prompt: plannedPrompt })
        row = {
          candidate,
          result: 'copy',
          target: distinctTargets[0],
          conflicts,
          plannedPrompt,
        }
      }
    } else if (policy === 'replace' && distinctTargets[0].scope === 'builtin') {
      row = {
        candidate,
        result: 'blocked',
        target: distinctTargets[0],
        conflicts,
        reason: 'builtin-replace',
      }
    } else if (policy === 'replace' && distinctTargets[0].scope === 'managed') {
      const target = distinctTargets[0]
      if (!sameMedia(candidate, target.prompt)) {
        row = { candidate, result: 'blocked', target, conflicts, reason: 'media-change' }
      } else {
        const plannedPrompt: PromptConcept = {
          ...candidate,
          id: target.prompt.id,
          source: target.prompt.source,
          media_types: [...target.prompt.media_types],
          status: 'approved',
        }
        const targetIndex = working.findIndex(({ id }) => id === target.prompt.id)
        working[targetIndex] = plannedPrompt
        row = { candidate, result: 'replace', target, conflicts, plannedPrompt }
      }
    } else {
      row = {
        candidate,
        result: 'blocked',
        target: distinctTargets[0],
        conflicts,
        reason: 'ambiguous',
      }
    }
    counts[row.result] += 1
    rows.push(row)
  }

  const blocked = counts.blocked > 0
  return {
    rows,
    counts,
    changedCount: counts.add + counts.replace + counts.copy,
    importAfterTotal: working.length,
    blocked,
    finalPrompts: blocked ? null : working,
  }
}
