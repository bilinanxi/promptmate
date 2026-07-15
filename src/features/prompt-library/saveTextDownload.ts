import { browserDownload, type BrowserDownloadRequest } from './browserDownload'

interface SaveFilter {
  name: string
  extensions: string[]
}

interface SaveOptions {
  defaultPath: string
  filters: SaveFilter[]
}

export interface TextDownloadEnvironment {
  isTauri(): boolean
  save(options: SaveOptions): Promise<string | null>
  writeTextFile(path: string, content: string): Promise<void>
  browserDownload(request: BrowserDownloadRequest): void
}

export type TextDownloadResult = 'saved' | 'cancelled' | 'downloaded'

function filterFor(fileName: string): SaveFilter {
  if (fileName.toLowerCase().endsWith('.csv')) return { name: 'CSV', extensions: ['csv'] }
  if (fileName.toLowerCase().endsWith('.jsonl')) return { name: 'JSONL', extensions: ['jsonl'] }
  return { name: 'JSON', extensions: ['json'] }
}

const defaultEnvironment: TextDownloadEnvironment = {
  isTauri: () => '__TAURI_INTERNALS__' in window,
  save: async (options) => (await import('@tauri-apps/plugin-dialog')).save(options),
  writeTextFile: async (path, content) =>
    (await import('@tauri-apps/plugin-fs')).writeTextFile(path, content),
  browserDownload,
}

export async function saveTextDownload(
  request: BrowserDownloadRequest,
  environment: TextDownloadEnvironment = defaultEnvironment,
): Promise<TextDownloadResult> {
  if (!environment.isTauri()) {
    environment.browserDownload(request)
    return 'downloaded'
  }

  const path = await environment.save({
    defaultPath: request.fileName,
    filters: [filterFor(request.fileName)],
  })
  if (!path) return 'cancelled'

  await environment.writeTextFile(path, request.content)
  return 'saved'
}
