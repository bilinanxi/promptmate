import { describe, expect, it } from 'vitest'
import { planPromptImport } from './planPromptImport'
import type { PromptConcept } from './types'

function prompt(overrides: Partial<PromptConcept> = {}): PromptConcept {
  return {
    schema_version: '1.0',
    id: 'community-new',
    zh: '新词条',
    en: 'new prompt',
    description_zh: '新描述',
    description_en: 'new description',
    category_id: 'people-subjects',
    tags: [],
    aliases_zh: [],
    aliases_en: [],
    media_types: ['image'],
    source: 'imported',
    status: 'approved',
    ...overrides,
  }
}

const managed = prompt({
  id: 'user-existing',
  zh: '已有词条',
  en: 'existing prompt',
  source: 'user',
})

describe('planPromptImport', () => {
  it('defaults to skipping an incoming row whose ID is already managed', () => {
    const incoming = prompt({ id: managed.id, zh: '不同名称', en: 'different name' })

    const plan = planPromptImport({ incoming: [incoming], managed: [managed], builtins: [] })

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({
      candidate: incoming,
      result: 'skip',
      target: { scope: 'managed', prompt: managed },
    })
    expect(plan.counts).toEqual({ add: 0, skip: 1, replace: 0, copy: 0, blocked: 0 })
    expect(plan.changedCount).toBe(0)
    expect(plan.importAfterTotal).toBe(1)
    expect(plan.blocked).toBe(false)
    expect(plan.finalPrompts).toEqual([managed])
  })

  it('detects trimmed Chinese and locale-independent English names only within the same media', () => {
    const incoming = [
      prompt({ id: 'one', zh: '  已有词条  ', en: 'unrelated' }),
      prompt({ id: 'two', zh: '不同', en: '  EXISTING PROMPT  ' }),
      prompt({
        id: 'three',
        zh: '已有词条',
        en: 'existing prompt',
        media_types: ['video'],
        category_id: 'camera-movement',
      }),
    ]

    const plan = planPromptImport({ incoming, managed: [managed], builtins: [] })

    expect(plan.rows.map(({ result }) => result)).toEqual(['skip', 'skip', 'add'])
    expect(plan.rows[0].conflicts.map(({ kind }) => kind)).toEqual(['zh'])
    expect(plan.rows[1].conflicts.map(({ kind }) => kind)).toEqual(['en'])
    expect(plan.finalPrompts).toHaveLength(2)
  })

  it('treats ID and names matching the same managed prompt as one target', () => {
    const plan = planPromptImport({
      incoming: [prompt({ id: managed.id, zh: ` ${managed.zh} `, en: managed.en.toUpperCase() })],
      managed: [managed],
      builtins: [],
    })

    expect(plan.rows[0]).toMatchObject({ result: 'skip', target: { prompt: managed } })
    expect(plan.rows[0].conflicts.map(({ kind }) => kind)).toEqual(['id', 'zh', 'en'])
  })

  it('blocks replace when the only conflict target is builtin', () => {
    const builtin = prompt({ id: 'builtin-light', source: 'builtin' })
    const plan = planPromptImport({
      incoming: [prompt({ id: builtin.id, zh: '改变', en: 'changed' })],
      managed: [],
      builtins: [builtin],
      policy: 'replace',
    })

    expect(plan.rows[0]).toMatchObject({
      result: 'blocked',
      reason: 'builtin-replace',
      target: { scope: 'builtin', prompt: builtin },
    })
    expect(plan.blocked).toBe(true)
    expect(plan.finalPrompts).toBeNull()
  })

  it('replaces managed content while preserving stable ID, source, media, and list position', () => {
    const other = prompt({ id: 'user-other', zh: '其他', en: 'other', source: 'user' })
    const incoming = prompt({
      id: managed.id,
      zh: '替换后',
      en: 'replacement',
      description_zh: '替换内容',
      source: 'imported',
      media_types: ['image'],
    })

    const plan = planPromptImport({
      incoming: [incoming],
      managed: [managed, other],
      builtins: [],
      policy: 'replace',
    })

    expect(plan.rows[0]).toMatchObject({ result: 'replace', target: { prompt: managed } })
    expect(plan.finalPrompts).toEqual([
      {
        ...incoming,
        id: managed.id,
        source: managed.source,
        media_types: managed.media_types,
        status: 'approved',
      },
      other,
    ])
    expect(plan.counts.replace).toBe(1)
    expect(plan.changedCount).toBe(1)
  })

  it('creates deterministic globally unique copy IDs across media and earlier planned copies', () => {
    const duplicate = prompt({ id: 'external-cafe', zh: managed.zh, en: 'Café!' })
    const occupiedBuiltin = prompt({
      id: 'imported-cafe',
      zh: '视频内置',
      en: 'video builtin',
      source: 'builtin',
      media_types: ['video'],
      category_id: 'camera-movement',
    })
    const occupiedManaged = prompt({ id: 'imported-cafe-2', zh: '占用', en: 'occupied' })

    const secondCopy = prompt({
      id: occupiedBuiltin.id,
      zh: '第二份可见名称',
      en: 'Cafe?',
      media_types: ['video'],
      category_id: 'camera-movement',
    })
    const plan = planPromptImport({
      incoming: [duplicate, secondCopy],
      managed: [managed, occupiedManaged],
      builtins: [occupiedBuiltin],
      policy: 'copy',
    })

    expect(plan.rows.map(({ result, plannedPrompt }) => [result, plannedPrompt?.id])).toEqual([
      ['copy', 'imported-cafe-3'],
      ['copy', 'imported-cafe-4'],
    ])
    expect(plan.finalPrompts?.slice(-2)).toMatchObject([
      { ...duplicate, id: 'imported-cafe-3', source: 'imported', status: 'approved' },
      { ...secondCopy, id: 'imported-cafe-4', source: 'imported', status: 'approved' },
    ])
  })

  it('blocks an ambiguous row whose ID and name point to different occupied records', () => {
    const builtin = prompt({
      id: 'builtin-name',
      zh: '名称目标',
      en: 'name target',
      source: 'builtin',
    })
    const plan = planPromptImport({
      incoming: [prompt({ id: managed.id, zh: builtin.zh, en: 'unique' })],
      managed: [managed],
      builtins: [builtin],
      policy: 'skip',
    })

    expect(plan.rows[0]).toMatchObject({ result: 'blocked', reason: 'ambiguous' })
    expect(plan.rows[0].conflicts.map(({ target }) => target.scope)).toEqual(['builtin', 'managed'])
    expect(plan.finalPrompts).toBeNull()
  })

  it('plans later incoming name duplicates relative to the earlier accepted row', () => {
    const first = prompt({ id: 'first', zh: '批次重复', en: 'batch duplicate' })
    const second = prompt({ id: 'second', zh: ' 批次重复 ', en: 'different' })
    const plan = planPromptImport({ incoming: [first, second], managed: [], builtins: [] })

    expect(plan.rows.map(({ result }) => result)).toEqual(['add', 'skip'])
    expect(plan.rows[1]).toMatchObject({ target: { scope: 'incoming', prompt: first } })
    expect(plan.finalPrompts).toEqual([first])
  })

  it('blocks a media-changing ID replacement', () => {
    const incoming = prompt({
      id: managed.id,
      zh: '视频替换',
      en: 'video replacement',
      media_types: ['video'],
      category_id: 'camera-movement',
    })
    const plan = planPromptImport({
      incoming: [incoming],
      managed: [managed],
      builtins: [],
      policy: 'replace',
    })

    expect(plan.rows[0]).toMatchObject({ result: 'blocked', reason: 'media-change' })
    expect(plan.finalPrompts).toBeNull()
  })

  it('blocks the whole plan when changed rows would exceed the 500 managed maximum', () => {
    const existing = Array.from({ length: 500 }, (_, index) =>
      prompt({ id: `user-${index}`, zh: `词条 ${index}`, en: `prompt ${index}` }),
    )
    const plan = planPromptImport({
      incoming: [prompt({ id: 'user-500', zh: '第 501 条', en: 'prompt 501' })],
      managed: existing,
      builtins: [],
    })

    expect(plan.rows[0]).toMatchObject({ result: 'blocked', reason: 'limit' })
    expect(plan.counts.blocked).toBe(1)
    expect(plan.importAfterTotal).toBe(500)
    expect(plan.finalPrompts).toBeNull()
  })
})
