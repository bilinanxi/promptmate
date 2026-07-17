export const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_OUTPUT_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_EDGE = 4096
export const MAX_IMAGE_PIXELS = 16_000_000

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface PreparedImage {
  mimeType: 'image/jpeg'
  base64: string
  previewUrl: string
  width: number
  height: number
  byteCount: number
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取处理后的图片。'))
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取处理后的图片。'))
    reader.readAsDataURL(blob)
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('无法安全处理这张图片。'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.9,
    )
  })
}

export async function prepareImageForPrompt(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error('仅支持 JPEG、PNG 或 WebP 图片。')
  if (file.size === 0) throw new Error('图片不能为空。')
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error('图片不能超过 8 MiB。')
  if (typeof createImageBitmap !== 'function') throw new Error('当前环境无法安全处理图片。')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('图片损坏或无法解码。')
  }

  try {
    const { width, height } = bitmap
    if (width <= 0 || height <= 0) throw new Error('图片尺寸无效。')
    if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
      throw new Error('图片尺寸不能超过 4096 × 4096。')
    }
    if (width * height > MAX_IMAGE_PIXELS) throw new Error('图片像素总量不能超过 1600 万。')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法安全处理图片。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const normalized = await canvasToJpeg(canvas)
    if (normalized.size === 0) throw new Error('处理后的图片为空。')
    if (normalized.size > MAX_IMAGE_OUTPUT_BYTES) {
      throw new Error('处理后的图片仍超过 5 MiB，请降低分辨率后重试。')
    }
    const previewUrl = await blobToDataUrl(normalized)
    const separator = previewUrl.indexOf(',')
    if (separator < 0) throw new Error('无法读取处理后的图片。')
    return {
      mimeType: 'image/jpeg',
      base64: previewUrl.slice(separator + 1),
      previewUrl,
      width,
      height,
      byteCount: normalized.size,
    }
  } finally {
    bitmap.close()
  }
}
