import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_IMAGE_EDGE, MAX_IMAGE_INPUT_BYTES, prepareImageForPrompt } from './imagePromptInput'

describe('prepareImageForPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects unsupported, empty, and oversized files before decoding', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)

    await expect(
      prepareImageForPrompt(
        new File([new Uint8Array([0x47])], 'reference.gif', { type: 'image/gif' }),
      ),
    ).rejects.toThrow('仅支持 JPEG、PNG 或 WebP')
    await expect(
      prepareImageForPrompt(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow('图片不能为空')
    await expect(
      prepareImageForPrompt(
        new File([new Uint8Array(MAX_IMAGE_INPUT_BYTES + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toThrow('图片不能超过 8 MiB')
    expect(decode).not.toHaveBeenCalled()
  })

  it('strips metadata by normalizing a bounded image to JPEG', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 50, close }))
    const fillRect = vi.fn()
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }))
    })

    const result = await prepareImageForPrompt(
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'reference.png', {
        type: 'image/png',
      }),
    )

    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      base64: '/9j/2Q==',
      width: 100,
      height: 50,
      byteCount: 4,
    })
    expect(result.previewUrl).toBe('data:image/jpeg;base64,/9j/2Q==')
    expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 50)
    expect(drawImage).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('rejects decoded images beyond the dimension boundary', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: MAX_IMAGE_EDGE + 1, height: 1, close }),
    )

    await expect(
      prepareImageForPrompt(new File([new Uint8Array([1])], 'wide.webp', { type: 'image/webp' })),
    ).rejects.toThrow('图片尺寸不能超过 4096 × 4096')
    expect(close).toHaveBeenCalled()
  })
})
