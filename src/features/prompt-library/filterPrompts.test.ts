import { describe, expect, it } from 'vitest'
import { builtinPrompts } from './builtinPrompts'
import { filterPrompts } from './filterPrompts'

describe('filterPrompts', () => {
  it('filters by an exact category', () => {
    const results = filterPrompts(builtinPrompts, { categoryId: 'scene-environment' })

    expect(results).toHaveLength(310)
    expect(results.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['neon-rain', 'chinese-courtyard', 'starry-sky']),
    )
    expect(results.every(({ category_id }) => category_id === 'scene-environment')).toBe(true)
  })

  it('keeps action and expression category results semantically separated', () => {
    const actions = new Set(
      filterPrompts(builtinPrompts, { categoryId: 'action-pose' }).map(({ id }) => id),
    )
    const expressions = new Set(
      filterPrompts(builtinPrompts, { categoryId: 'expression-emotion' }).map(({ id }) => id),
    )

    expect(actions.size).toBe(429)
    expect(expressions.size).toBe(68)
    expect(actions.has('gravure-pose')).toBe(true)
    expect(actions.has('streaming-tears')).toBe(false)
    expect(expressions.has('streaming-tears')).toBe(true)
    expect(expressions.has('gravure-pose')).toBe(false)
  })

  it('filters by an exact tag', () => {
    expect(filterPrompts(builtinPrompts, { tag: '电影感' }).map(({ id }) => id)).toEqual([
      'neon-rain',
      'cinematic',
    ])
  })

  it('filters by source', () => {
    expect(filterPrompts(builtinPrompts, { source: 'builtin' })).toHaveLength(builtinPrompts.length)
    expect(filterPrompts(builtinPrompts, { source: 'user' })).toEqual([])
  })

  it('combines search, category, tag, and source with AND semantics', () => {
    expect(
      filterPrompts(builtinPrompts, {
        query: '光',
        categoryId: 'lighting-atmosphere',
        tag: '人像',
        source: 'builtin',
      }).map(({ id }) => id),
    ).toEqual(['rim-light'])
  })

  it('returns the complete library when no criteria are active', () => {
    expect(filterPrompts(builtinPrompts, {})).toEqual(builtinPrompts)
  })
})
