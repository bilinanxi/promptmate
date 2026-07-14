import { describe, expect, it, vi } from 'vitest'

describe('parsePromptJsonl CSP compatibility', () => {
  it('initializes when dynamic code generation is blocked', async () => {
    vi.resetModules()
    const originalFunction = globalThis.Function
    const blockedFunction = () => {
      throw new EvalError('dynamic code generation is blocked by CSP')
    }

    Object.defineProperty(globalThis, 'Function', {
      configurable: true,
      value: blockedFunction,
      writable: true,
    })

    try {
      await expect(import('./parsePromptJsonl')).resolves.toHaveProperty('parsePromptJsonl')
    } finally {
      Object.defineProperty(globalThis, 'Function', {
        configurable: true,
        value: originalFunction,
        writable: true,
      })
    }
  })
})
