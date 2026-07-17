import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { AI_PROVIDER_STORAGE_KEY } from './features/ai/aiProviderConfig'

const aiMocks = vi.hoisted(() => ({
  ['hasApi' + 'Key']: vi.fn().mockResolvedValue(true),
  generateFromVideo: vi.fn(),
  cancel: vi.fn(),
}))

const videoInputMocks = vi.hoisted(() => ({
  prepareVideoForPrompt: vi.fn(),
}))

vi.mock('./features/ai/videoPromptInput', async (importOriginal) => {
  const original = await importOriginal<typeof import('./features/ai/videoPromptInput')>()
  return { ...original, ...videoInputMocks }
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

async function openVideoPromptWorkspace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '视频' }))
  expect(screen.queryByRole('region', { name: '视频转提示词' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '视频转提示词' }))
  return screen.getByRole('region', { name: '视频转提示词' })
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
      model: 'multi-image-vision-model',
    }),
  )
  aiMocks.cancel.mockResolvedValue(undefined)
  const frames = Array.from({ length: 6 }, (_, index) => ({
    mimeType: 'image/jpeg' as const,
    base64: `/9j/frame-${index}/2Q==`,
    previewUrl: `data:image/jpeg;base64,/9j/frame-${index}/2Q==`,
    byteCount: 4,
    timeSeconds: index * 2,
  }))
  videoInputMocks.prepareVideoForPrompt.mockResolvedValue({
    durationMs: 10_000,
    width: 1920,
    height: 1080,
    frames,
  })
  aiMocks.generateFromVideo.mockResolvedValue({
    zh: '红色陶瓷杯滑向画面中央，镜头缓慢推进。',
    en: 'A red ceramic mug slides to the center as the camera slowly pushes in.',
  })
})

describe('video to prompt workspace', () => {
  it('keeps the video local and sends only ordered normalized frames after explicit generation', async () => {
    const user = userEvent.setup()
    render(<App />)
    const workspace = await openVideoPromptWorkspace(user)

    expect(
      within(workspace).getByText(/仅发送 6 张去除元数据的 JPEG 时间采样帧/),
    ).toBeInTheDocument()
    expect(within(workspace).getByText(/不会发送原视频或音频/)).toBeInTheDocument()
    const file = new File([new Uint8Array([0, 0, 0, 1])], 'motion.mp4', {
      type: 'video/mp4',
    })
    await user.upload(within(workspace).getByLabelText('选择参考视频'), file)

    expect(await within(workspace).findAllByRole('img', { name: /视频时间采样帧/ })).toHaveLength(6)
    expect(aiMocks.generateFromVideo).not.toHaveBeenCalled()
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))

    expect(aiMocks.generateFromVideo).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'multi-image-vision-model' }),
      {
        durationMs: 10_000,
        frames: Array.from({ length: 6 }, (_, index) => ({
          timestampMs: index * 2_000,
          mimeType: 'image/jpeg',
          base64: `/9j/frame-${index}/2Q==`,
        })),
      },
      'balanced',
      expect.stringMatching(/^video-/),
    )
    const result = within(workspace).getByRole('textbox', { name: '视频提示词结果' })
    expect(result).toHaveValue('红色陶瓷杯滑向画面中央，镜头缓慢推进。')
    await user.click(within(workspace).getByRole('button', { name: 'EN' }))
    expect(result).toHaveValue(
      'A red ceramic mug slides to the center as the camera slowly pushes in.',
    )
  })

  it('cancels active analysis and ignores late results when leaving video mode', async () => {
    const pending = deferred<{ zh: string; en: string }>()
    aiMocks.generateFromVideo.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    const workspace = await openVideoPromptWorkspace(user)
    await user.upload(
      within(workspace).getByLabelText('选择参考视频'),
      new File([new Uint8Array([1])], 'motion.webm', { type: 'video/webm' }),
    )
    await within(workspace).findAllByRole('img', { name: /视频时间采样帧/ })
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    const requestId = aiMocks.generateFromVideo.mock.calls[0][3]

    expect(
      within(workspace).getByRole('progressbar', { name: '视频转提示词进度' }),
    ).toHaveAttribute('aria-valuetext', '正在等待多图视觉模型响应')
    await user.click(screen.getByRole('button', { name: '图片' }))
    expect(aiMocks.cancel).toHaveBeenCalledWith(requestId)
    expect(screen.queryByRole('region', { name: '视频转提示词' })).not.toBeInTheDocument()

    await act(async () => {
      pending.resolve({ zh: '不应出现', en: 'Must not appear' })
      await pending.promise
    })
    expect(screen.queryByDisplayValue('不应出现')).not.toBeInTheDocument()
  })
})
