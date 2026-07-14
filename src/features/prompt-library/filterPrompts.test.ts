import { describe, expect, it } from 'vitest'
import { builtinPrompts } from './builtinPrompts'
import { filterPrompts } from './filterPrompts'

describe('filterPrompts', () => {
  it('filters by an exact category', () => {
    expect(
      filterPrompts(builtinPrompts, { categoryId: 'scene-environment' }).map(({ id }) => id),
    ).toEqual(['neon-rain', 'chinese-courtyard'])
  })

  it('filters by an exact tag', () => {
    expect(filterPrompts(builtinPrompts, { tag: '电影感' }).map(({ id }) => id)).toEqual([
      'neon-rain',
      'cinematic',
    ])
  })

  it('filters by source', () => {
    expect(filterPrompts(builtinPrompts, { source: 'builtin' })).toHaveLength(12)
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
