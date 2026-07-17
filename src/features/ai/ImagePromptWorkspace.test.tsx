import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import { ImagePromptWorkspace } from './ImagePromptWorkspace'
import type { AiProviderConfig } from './aiProviderConfig'

const mocks = vi.hoisted(() => ({
  generateFromImage: vi.fn(),
  cancel: vi.fn(),
  prepareImageForPrompt: vi.fn(),
}))

vi.mock('./aiNativeClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('./aiNativeClient')>()
  return {
    ...original,
    aiNativeClient: {
      ...original.aiNativeClient,
      generateFromImage: mocks.generateFromImage,
      cancel: mocks.cancel,
    },
  }
})

vi.mock('./imagePromptInput', async (importOriginal) => {
  const original = await importOriginal<typeof import('./imagePromptInput')>()
  return { ...original, prepareImageForPrompt: mocks.prepareImageForPrompt }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const firstConfig: AiProviderConfig = {
  version: 1,
  kind: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  model: 'vision-a',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cancel.mockResolvedValue(undefined)
  mocks.prepareImageForPrompt.mockResolvedValue({
    mimeType: 'image/jpeg',
    base64: '/9j/2Q==',
    previewUrl: 'data:image/jpeg;base64,/9j/2Q==',
    width: 100,
    height: 50,
    byteCount: 4,
  })
})

it('cancels and ignores a pending result when the provider configuration changes', async () => {
  const pending = deferred<{ zh: string; en: string }>()
  mocks.generateFromImage.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  const { rerender } = render(
    <ImagePromptWorkspace config={firstConfig} mode="balanced" onOpenSettings={vi.fn()} />,
  )
  await user.upload(
    screen.getByLabelText('选择参考图片'),
    new File([new Uint8Array([1])], 'reference.png', { type: 'image/png' }),
  )
  await screen.findByRole('img', { name: '参考图片预览' })
  await user.click(screen.getByRole('button', { name: '生成双语提示词' }))
  const requestId = mocks.generateFromImage.mock.calls[0][3]

  rerender(
    <ImagePromptWorkspace
      config={{ ...firstConfig, model: 'vision-b' }}
      mode="balanced"
      onOpenSettings={vi.fn()}
    />,
  )

  expect(mocks.cancel).toHaveBeenCalledWith(requestId)
  await act(async () => {
    pending.resolve({ zh: '迟到结果', en: 'Late result' })
    await pending.promise
  })
  expect(screen.getByRole('textbox', { name: '图片提示词结果' })).toHaveValue('')
})

it('shows a bounded native string error from the configured provider', async () => {
  mocks.generateFromImage.mockRejectedValue('AI 服务返回 HTTP 400。')
  const user = userEvent.setup()
  render(<ImagePromptWorkspace config={firstConfig} mode="balanced" onOpenSettings={vi.fn()} />)

  await user.upload(
    screen.getByLabelText('选择参考图片'),
    new File([new Uint8Array([1])], 'reference.png', { type: 'image/png' }),
  )
  await screen.findByRole('img', { name: '参考图片预览' })
  await user.click(screen.getByRole('button', { name: '生成双语提示词' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('AI 服务返回 HTTP 400。')
})
