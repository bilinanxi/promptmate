export const MAX_VIDEO_INPUT_BYTES = 64 * 1024 * 1024
export const MAX_VIDEO_DURATION_SECONDS = 60
export const MAX_VIDEO_EDGE = 3840
export const MAX_VIDEO_PIXELS = 8_294_400
export const VIDEO_FRAME_COUNT = 6
export const MAX_VIDEO_FRAME_EDGE = 960
export const MAX_VIDEO_FRAME_BYTES = 640 * 1024
export const MAX_VIDEO_TOTAL_FRAME_BYTES = 4 * 1024 * 1024

const ACCEPTED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm'])
const MEDIA_EVENT_TIMEOUT_MS = 15_000
const VIDEO_FRAME_TIMEOUT_MS = 5_000

function abortError() {
  return new DOMException('视频处理已取消。', 'AbortError')
}

export interface PreparedVideoFrame {
  mimeType: 'image/jpeg'
  base64: string
  previewUrl: string
  byteCount: number
  timeSeconds: number
}

export interface PreparedVideo {
  durationMs: number
  width: number
  height: number
  frames: PreparedVideoFrame[]
}

export interface VideoFrameEnvironment {
  createObjectURL(file: File): string
  revokeObjectURL(url: string): void
  createVideo(): HTMLVideoElement
  createCanvas(): HTMLCanvasElement
}

const defaultEnvironment: VideoFrameEnvironment = {
  createObjectURL: (file) => URL.createObjectURL(file),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createVideo: () => document.createElement('video'),
  createCanvas: () => document.createElement('canvas'),
}

function waitForMediaEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  failureMessage: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => finish(new Error(failureMessage)),
      MEDIA_EVENT_TIMEOUT_MS,
    )
    const onSuccess = () => finish()
    const onError = () => finish(new Error(failureMessage))
    const onAbort = () => finish(abortError())
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      video.removeEventListener(eventName, onSuccess)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    video.addEventListener(eventName, onSuccess, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法安全提取视频时间采样帧。'))),
      'image/jpeg',
      0.82,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取视频时间采样帧。'))
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取视频时间采样帧。'))
    reader.readAsDataURL(blob)
  })
}

function frameTimes(duration: number): number[] {
  return Array.from({ length: VIDEO_FRAME_COUNT }, (_, index) =>
    Number(((duration * (index + 0.5)) / VIDEO_FRAME_COUNT).toFixed(3)),
  )
}

function waitForPresentedFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let videoFrameId: number | undefined
    let animationFrameId: number | undefined
    const timeout = window.setTimeout(
      () => finish(new Error('读取视频时间采样帧超时。')),
      VIDEO_FRAME_TIMEOUT_MS,
    )
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      if (videoFrameId !== undefined && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrameId)
      }
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(abortError())
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) return onAbort()
    if (typeof video.requestVideoFrameCallback === 'function') {
      videoFrameId = video.requestVideoFrameCallback(() => finish())
    } else {
      animationFrameId = requestAnimationFrame(() => finish())
    }
  })
}

export async function prepareVideoForPrompt(
  file: File,
  environment: VideoFrameEnvironment = defaultEnvironment,
  signal?: AbortSignal,
): Promise<PreparedVideo> {
  if (!ACCEPTED_VIDEO_TYPES.has(file.type)) throw new Error('仅支持 MP4 或 WebM 视频。')
  if (file.size === 0) throw new Error('视频不能为空。')
  if (file.size > MAX_VIDEO_INPUT_BYTES) throw new Error('视频不能超过 64 MiB。')

  const objectUrl = environment.createObjectURL(file)
  const video = environment.createVideo()
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true

  try {
    if (signal?.aborted) throw abortError()
    const metadataReady = waitForMediaEvent(video, 'loadedmetadata', '视频损坏或无法解码。', signal)
    video.src = objectUrl
    await metadataReady

    const { duration, videoWidth: width, videoHeight: height } = video
    if (!Number.isFinite(duration) || duration < 1) throw new Error('视频时长必须至少为 1 秒。')
    if (duration > MAX_VIDEO_DURATION_SECONDS) throw new Error('视频时长不能超过 60 秒。')
    if (width <= 0 || height <= 0) throw new Error('视频尺寸无效。')
    if (width > MAX_VIDEO_EDGE || height > MAX_VIDEO_EDGE) {
      throw new Error('视频尺寸不能超过 3840 × 3840。')
    }
    if (width * height > MAX_VIDEO_PIXELS) throw new Error('视频像素总量不能超过约 830 万。')

    const scale = Math.min(1, MAX_VIDEO_FRAME_EDGE / Math.max(width, height))
    const frameWidth = Math.max(1, Math.round(width * scale))
    const frameHeight = Math.max(1, Math.round(height * scale))
    const canvas = environment.createCanvas()
    canvas.width = frameWidth
    canvas.height = frameHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法安全处理视频。')

    let totalBytes = 0
    const frames: PreparedVideoFrame[] = []
    for (const timeSeconds of frameTimes(duration)) {
      if (signal?.aborted) throw abortError()
      const seeked = waitForMediaEvent(video, 'seeked', '无法读取视频时间采样帧。', signal)
      const presented = waitForPresentedFrame(video, signal)
      video.currentTime = timeSeconds
      await Promise.all([seeked, presented])
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, frameWidth, frameHeight)
      context.drawImage(video, 0, 0, frameWidth, frameHeight)
      const jpeg = await canvasToJpeg(canvas)
      if (jpeg.size === 0) throw new Error('提取的视频时间采样帧为空。')
      if (jpeg.size > MAX_VIDEO_FRAME_BYTES) {
        throw new Error('单个视频时间采样帧超过 640 KiB，请降低视频分辨率后重试。')
      }
      totalBytes += jpeg.size
      if (totalBytes > MAX_VIDEO_TOTAL_FRAME_BYTES) {
        throw new Error('视频时间采样帧总量超过 4 MiB，请降低视频分辨率后重试。')
      }
      const previewUrl = await blobToDataUrl(jpeg)
      const separator = previewUrl.indexOf(',')
      if (separator < 0) throw new Error('无法读取视频时间采样帧。')
      frames.push({
        mimeType: 'image/jpeg',
        base64: previewUrl.slice(separator + 1),
        previewUrl,
        byteCount: jpeg.size,
        timeSeconds,
      })
    }

    return {
      durationMs: Math.round(duration * 1000),
      width,
      height,
      frames,
    }
  } finally {
    environment.revokeObjectURL(objectUrl)
  }
}
