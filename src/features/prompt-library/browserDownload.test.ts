import { describe, expect, it, vi } from 'vitest'
import { browserDownload, type BrowserDownloadEnvironment } from './browserDownload'

describe('browserDownload', () => {
  it('creates a UTF-8 Blob, clicks a temporary native download link once, and always cleans up', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove } as unknown as HTMLAnchorElement
    const createElement = vi.fn(() => anchor)
    const appendChild = vi.fn()
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob
      return 'blob:promptmate'
    })
    const revokeObjectURL = vi.fn()
    const environment: BrowserDownloadEnvironment = {
      createElement,
      appendChild,
      createObjectURL,
      revokeObjectURL,
    }

    browserDownload(
      {
        content: '{"id":"词条"}\n',
        fileName: 'promptmate-image-all.jsonl',
        mimeType: 'application/x-ndjson;charset=utf-8',
      },
      environment,
    )

    expect(createElement).toHaveBeenCalledOnce()
    expect(createElement).toHaveBeenCalledWith('a')
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/x-ndjson;charset=utf-8')
    expect(blob.size).toBe(new TextEncoder().encode('{"id":"词条"}\n').byteLength)
    expect(anchor.href).toBe('blob:promptmate')
    expect(anchor.download).toBe('promptmate-image-all.jsonl')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:promptmate')
  })

  it('revokes the object URL and removes the link when click throws', () => {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(() => {
        throw new Error('blocked')
      }),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement
    const revokeObjectURL = vi.fn()
    const environment: BrowserDownloadEnvironment = {
      createElement: () => anchor,
      appendChild: vi.fn(),
      createObjectURL: () => 'blob:promptmate',
      revokeObjectURL,
    }

    expect(() =>
      browserDownload(
        { content: 'safe', fileName: 'safe.jsonl', mimeType: 'application/x-ndjson;charset=utf-8' },
        environment,
      ),
    ).toThrow('blocked')
    expect(anchor.remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:promptmate')
  })
})
