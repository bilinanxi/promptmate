export interface BrowserDownloadRequest {
  content: string
  fileName: string
  mimeType: string
}

export interface BrowserDownloadEnvironment {
  createElement(tagName: 'a'): HTMLAnchorElement
  appendChild(anchor: HTMLAnchorElement): unknown
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

function defaultEnvironment(): BrowserDownloadEnvironment {
  return {
    createElement: (tagName) => document.createElement(tagName),
    appendChild: (anchor) => document.body.appendChild(anchor),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  }
}

export function browserDownload(
  request: BrowserDownloadRequest,
  environment: BrowserDownloadEnvironment = defaultEnvironment(),
): void {
  const blob = new Blob([request.content], { type: request.mimeType })
  const objectUrl = environment.createObjectURL(blob)
  const anchor = environment.createElement('a')
  try {
    anchor.href = objectUrl
    anchor.download = request.fileName
    environment.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    environment.revokeObjectURL(objectUrl)
  }
}
