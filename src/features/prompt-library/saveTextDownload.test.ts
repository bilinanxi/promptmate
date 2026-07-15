import { describe, expect, it, vi } from 'vitest'
import { saveTextDownload, type TextDownloadEnvironment } from './saveTextDownload'

const request = {
  content: '{"ok":true}\n',
  fileName: 'promptmate-image-all.promptmate.json',
  mimeType: 'application/json;charset=utf-8',
}

function environment(overrides: Partial<TextDownloadEnvironment> = {}): TextDownloadEnvironment {
  return {
    isTauri: () => true,
    save: vi.fn().mockResolvedValue('C:\\Exports\\promptmate.promptmate.json'),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    browserDownload: vi.fn(),
    ...overrides,
  }
}

describe('saveTextDownload', () => {
  it('uses a native save dialog and writes the exact export in Tauri', async () => {
    const env = environment()

    await expect(saveTextDownload(request, env)).resolves.toBe('saved')

    expect(env.save).toHaveBeenCalledWith({
      defaultPath: request.fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    expect(env.writeTextFile).toHaveBeenCalledWith(
      'C:\\Exports\\promptmate.promptmate.json',
      request.content,
    )
    expect(env.browserDownload).not.toHaveBeenCalled()
  })

  it('uses only the browser adapter outside Tauri', async () => {
    const env = environment({ isTauri: () => false })

    await expect(saveTextDownload(request, env)).resolves.toBe('downloaded')

    expect(env.browserDownload).toHaveBeenCalledOnce()
    expect(env.browserDownload).toHaveBeenCalledWith(request)
    expect(env.save).not.toHaveBeenCalled()
    expect(env.writeTextFile).not.toHaveBeenCalled()
  })

  it('does not write when the native save dialog is cancelled', async () => {
    const env = environment({ save: vi.fn().mockResolvedValue(null) })

    await expect(saveTextDownload(request, env)).resolves.toBe('cancelled')

    expect(env.writeTextFile).not.toHaveBeenCalled()
    expect(env.browserDownload).not.toHaveBeenCalled()
  })

  it.each([
    ['CSV', 'promptmate-image-all.csv', 'csv'],
    ['JSONL', 'promptmate-image-all.jsonl', 'jsonl'],
  ])('uses the %s native filter', async (name, fileName, extension) => {
    const env = environment()

    await saveTextDownload({ ...request, fileName }, env)

    expect(env.save).toHaveBeenCalledWith({
      defaultPath: fileName,
      filters: [{ name, extensions: [extension] }],
    })
  })
})
