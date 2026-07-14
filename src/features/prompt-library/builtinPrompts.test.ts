import { describe, expect, it } from 'vitest'
import { builtinPrompts } from './builtinPrompts'

describe('builtinPrompts', () => {
  it('loads the validated image prompt library', () => {
    expect(builtinPrompts).toHaveLength(12)
    expect(builtinPrompts[0]).toMatchObject({
      id: 'young-woman',
      media_types: ['image'],
      source: 'builtin',
      status: 'approved',
    })
  })
})
