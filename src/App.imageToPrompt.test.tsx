import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AI_PROVIDER_STORAGE_KEY } from './features/ai/aiProviderConfig'

const aiMocks = vi.hoisted(() => ({
  hasApiKey: vi.fn(),
  generateFromImage: vi.fn(),
  cancel: vi.fn(),
}))

const imageInputMocks = vi.hoisted(() => ({
  prepareImageForPrompt: vi.fn(),
}))

vi.mock('./features/ai/imagePromptInput', async (importOriginal) => {
  const original = await importOriginal<typeof import('./features/ai/imagePromptInput')>()
  return { ...original, ...imageInputMocks }
})

vi.mock('./features/ai/aiNativeClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('./features/ai/aiNativeClient')>()
  return {
    ...original,
    aiNativeClient: { ...original.aiNativeClient, ...aiMocks },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function openImagePromptWorkspace(user: ReturnType<typeof userEvent.setup>) {
  expect(screen.queryByRole('region', { name: '图片转提示词' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '图片转提示词' }))
  return screen.getByRole('region', { name: '图片转提示词' })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  localStorage.setItem(
    AI_PROVIDER_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: 'vision-model',
    }),
  )
  aiMocks.cancel.mockResolvedValue(undefined)
  imageInputMocks.prepareImageForPrompt.mockImplementation((file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return Promise.reject(new Error('仅支持 JPEG、PNG 或 WebP 图片。'))
    }
    return Promise.resolve({
      mimeType: 'image/jpeg',
      base64: '/9j/2Q==',
      previewUrl: 'data:image/jpeg;base64,/9j/2Q==',
      width: 100,
      height: 50,
      byteCount: 4,
    })
  })
  aiMocks.generateFromImage.mockResolvedValue({
    zh: '极简白色背景上的红色陶瓷杯，柔和侧光。',
    en: 'A red ceramic mug on a minimal white background, soft side lighting.',
  })
})

describe('image to prompt workspace', () => {
  it('keeps a selected image local until generating aligned bilingual prompts', async () => {
    const user = userEvent.setup()
    render(<App />)

    const workspace = await openImagePromptWorkspace(user)
    expect(within(workspace).getByRole('heading', { name: '图片转提示词' })).toBeInTheDocument()
    expect(within(workspace).getByText(/去除元数据的 JPEG 图片才会发送/)).toBeInTheDocument()
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'reference.png',
      {
        type: 'image/png',
      },
    )
    await user.upload(within(workspace).getByLabelText('选择参考图片'), file)

    expect(await within(workspace).findByRole('img', { name: '参考图片预览' })).toBeInTheDocument()
    expect(aiMocks.generateFromImage).not.toHaveBeenCalled()
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))

    expect(aiMocks.generateFromImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'vision-model' }),
      { mimeType: 'image/jpeg', base64: '/9j/2Q==' },
      'balanced',
      expect.stringMatching(/^image-/),
    )
    const result = within(workspace).getByRole('textbox', { name: '图片提示词结果' })
    const chineseButton = within(workspace).getByRole('button', { name: '中文' })
    const englishButton = within(workspace).getByRole('button', { name: 'EN' })
    expect(chineseButton).toHaveAttribute('aria-pressed', 'true')
    expect(englishButton).toHaveAttribute('aria-pressed', 'false')
    expect(result).toHaveValue('极简白色背景上的红色陶瓷杯，柔和侧光。')
    await user.click(englishButton)
    expect(chineseButton).toHaveAttribute('aria-pressed', 'false')
    expect(englishButton).toHaveAttribute('aria-pressed', 'true')
    expect(result).toHaveValue(
      'A red ceramic mug on a minimal white background, soft side lighting.',
    )
  })

  it('copies the edited prompt in the active language', async () => {
    const user = userEvent.setup()
    render(<App />)
    const workspace = await openImagePromptWorkspace(user)
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'reference.png',
      { type: 'image/png' },
    )
    await user.upload(within(workspace).getByLabelText('选择参考图片'), file)
    await within(workspace).findByRole('img', { name: '参考图片预览' })
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    const result = within(workspace).getByRole('textbox', { name: '图片提示词结果' })
    await user.clear(result)
    await user.type(result, '用户编辑后的图片提示词')
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(within(workspace).getByRole('button', { name: '复制当前提示词' }))

    expect(writeText).toHaveBeenCalledWith('用户编辑后的图片提示词')
    expect(within(workspace).getByRole('status')).toHaveTextContent('已复制图片提示词')
  })

  it('rejects unsupported files before invoking the configured provider', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    const workspace = await openImagePromptWorkspace(user)
    const file = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'reference.gif', {
      type: 'image/gif',
    })

    await user.upload(within(workspace).getByLabelText('选择参考图片'), file)

    expect(within(workspace).getByRole('alert')).toHaveTextContent('仅支持 JPEG、PNG 或 WebP')
    expect(aiMocks.generateFromImage).not.toHaveBeenCalled()
  })

  it('cancels an active analysis and ignores its late result', async () => {
    const pending = deferred<{ zh: string; en: string }>()
    aiMocks.generateFromImage.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    const workspace = await openImagePromptWorkspace(user)
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'pending.png',
      { type: 'image/png' },
    )
    await user.upload(within(workspace).getByLabelText('选择参考图片'), file)
    await within(workspace).findByRole('img', { name: '参考图片预览' })
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    const requestId = aiMocks.generateFromImage.mock.calls[0][3]

    expect(
      within(workspace).getByRole('progressbar', { name: '图片转提示词进度' }),
    ).toHaveAttribute('aria-valuetext', '正在等待视觉模型响应')
    await user.click(within(workspace).getByRole('button', { name: '取消图片分析' }))
    expect(aiMocks.cancel).toHaveBeenCalledWith(requestId)

    await act(async () => {
      pending.resolve({ zh: '不应出现', en: 'Must not appear' })
      await pending.promise
    })
    expect(within(workspace).getByRole('textbox', { name: '图片提示词结果' })).toHaveValue('')
    expect(within(workspace).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('preserves user edits made while a regeneration is pending', async () => {
    const pending = deferred<{ zh: string; en: string }>()
    const user = userEvent.setup()
    render(<App />)
    const workspace = await openImagePromptWorkspace(user)
    const file = new File([new Uint8Array([1])], 'reference.png', { type: 'image/png' })
    await user.upload(within(workspace).getByLabelText('选择参考图片'), file)
    await within(workspace).findByRole('img', { name: '参考图片预览' })
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    aiMocks.generateFromImage.mockReturnValueOnce(pending.promise)
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    const requestId = aiMocks.generateFromImage.mock.calls[1][3]
    const result = within(workspace).getByRole('textbox', { name: '图片提示词结果' })

    await user.clear(result)
    await user.type(result, '用户在等待期间编辑的提示词')

    expect(aiMocks.cancel).toHaveBeenCalledWith(requestId)
    expect(within(workspace).getByRole('status')).toHaveTextContent('内容已修改，AI 结果未覆盖')
    await act(async () => {
      pending.resolve({ zh: '迟到结果', en: 'Late result' })
      await pending.promise
    })
    expect(result).toHaveValue('用户在等待期间编辑的提示词')
  })
})
