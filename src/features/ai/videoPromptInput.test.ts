import { describe, expect, it, vi } from 'vitest'

import {
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_INPUT_BYTES,
  prepareVideoForPrompt,
  type VideoFrameEnvironment,
} from './videoPromptInput'

function environment(
  metadata: { duration: number; width: number; height: number },
  behavior: { onSeek?: () => void; presentFrame?: boolean } = {},
) {
  const video = document.createElement('video')
  let currentTime = 0
  const frameEvents: string[] = []
  Object.defineProperties(video, {
    duration: { value: metadata.duration },
    videoWidth: { value: metadata.width },
    videoHeight: { value: metadata.height },
    currentTime: {
      get: () => currentTime,
      set: (value: number) => {
        frameEvents.push('seek')
        currentTime = value
        behavior.onSeek?.()
        queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
      },
    },
    requestVideoFrameCallback: {
      value: (callback: VideoFrameRequestCallback) => {
        frameEvents.push('subscribe')
        if (behavior.presentFrame !== false) {
          queueMicrotask(() => callback(0, {} as VideoFrameCallbackMetadata))
        }
        return 1
      },
    },
    src: {
      set: () => queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    },
  })
  const fillRect = vi.fn()
  const drawImage = vi.fn()
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }))
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: '', fillRect, drawImage }),
    toBlob,
  } as unknown as HTMLCanvasElement
  const frameEnvironment: VideoFrameEnvironment = {
    createObjectURL: vi.fn(() => 'blob:video'),
    revokeObjectURL: vi.fn(),
    createVideo: () => video,
    createCanvas: () => canvas,
  }
  return { frameEnvironment, fillRect, drawImage, toBlob, frameEvents }
}

describe('prepareVideoForPrompt', () => {
  it('extracts six ordered metadata-free JPEG frames without uploading the video', async () => {
    const { frameEnvironment, fillRect, drawImage, toBlob, frameEvents } = environment({
      duration: 10,
      width: 1920,
      height: 1080,
    })
    const file = new File([new Uint8Array([0, 0, 0, 1])], 'clip.mp4', { type: 'video/mp4' })

    const result = await prepareVideoForPrompt(file, frameEnvironment)

    expect(result).toMatchObject({
      durationMs: 10_000,
      width: 1920,
      height: 1080,
    })
    expect(result.frames).toHaveLength(6)
    expect(result.frames.every((frame) => frame.mimeType === 'image/jpeg')).toBe(true)
    expect(result.frames.every((frame) => frame.base64 === '/9j/2Q==')).toBe(true)
    expect(result.frames.map((frame) => frame.timeSeconds)).toEqual([
      0.833, 2.5, 4.167, 5.833, 7.5, 9.167,
    ])
    expect(frameEvents.slice(0, 2)).toEqual(['subscribe', 'seek'])
    expect((frameEnvironment.createCanvas() as HTMLCanvasElement).width).toBe(960)
    expect(fillRect).toHaveBeenCalledTimes(6)
    expect(drawImage).toHaveBeenCalledTimes(6)
    expect(toBlob).toHaveBeenCalledTimes(6)
    expect(frameEnvironment.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })

  it('stops and revokes the local object URL when extraction is cancelled', async () => {
    const { frameEnvironment } = environment({ duration: 10, width: 1920, height: 1080 })
    const controller = new AbortController()
    controller.abort()

    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array([1])], 'cancelled.mp4', { type: 'video/mp4' }),
        frameEnvironment,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(frameEnvironment.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })

  it('handles both pending frame waits when extraction is aborted during seek', async () => {
    const controller = new AbortController()
    const { frameEnvironment } = environment(
      { duration: 10, width: 1920, height: 1080 },
      {
        onSeek: () => controller.abort(),
        presentFrame: false,
      },
    )

    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array([1])], 'cancelled-during-seek.mp4', { type: 'video/mp4' }),
        frameEnvironment,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(frameEnvironment.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })

  it('rejects unsupported, empty, and oversized videos before decoding', async () => {
    const { frameEnvironment } = environment({ duration: 1, width: 100, height: 100 })

    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array([1])], 'clip.mov', { type: 'video/quicktime' }),
        frameEnvironment,
      ),
    ).rejects.toThrow('仅支持 MP4 或 WebM')
    await expect(
      prepareVideoForPrompt(new File([], 'empty.mp4', { type: 'video/mp4' }), frameEnvironment),
    ).rejects.toThrow('视频不能为空')
    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array(MAX_VIDEO_INPUT_BYTES + 1)], 'large.webm', {
          type: 'video/webm',
        }),
        frameEnvironment,
      ),
    ).rejects.toThrow('视频不能超过 64 MiB')
    expect(frameEnvironment.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects decoded videos beyond duration and dimension boundaries', async () => {
    const tooLong = environment({
      duration: MAX_VIDEO_DURATION_SECONDS + 0.001,
      width: 1280,
      height: 720,
    })
    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array([1])], 'long.mp4', { type: 'video/mp4' }),
        tooLong.frameEnvironment,
      ),
    ).rejects.toThrow('视频时长不能超过 60 秒')

    const tooWide = environment({ duration: 1, width: 3841, height: 720 })
    await expect(
      prepareVideoForPrompt(
        new File([new Uint8Array([1])], 'wide.webm', { type: 'video/webm' }),
        tooWide.frameEnvironment,
      ),
    ).rejects.toThrow('视频尺寸不能超过 3840 × 3840')
  })
})
