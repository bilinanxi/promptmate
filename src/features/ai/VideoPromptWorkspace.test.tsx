import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiProviderConfig } from './aiProviderConfig'
import { VideoPromptWorkspace } from './VideoPromptWorkspace'

const nativeMocks = vi.hoisted(() => ({
  generateFromVideo: vi.fn(),
  cancel: vi.fn(),
}))
const inputMocks = vi.hoisted(() => ({ prepareVideoForPrompt: vi.fn() }))

vi.mock('./aiNativeClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('./aiNativeClient')>()
  return {
    ...original,
    aiNativeClient: { ...original.aiNativeClient, ...nativeMocks },
  }
})
vi.mock('./videoPromptInput', async (importOriginal) => {
  const original = await importOriginal<typeof import('./videoPromptInput')>()
  return { ...original, ...inputMocks }
})

const config: AiProviderConfig = {
  version: 1,
  kind: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  model: 'vision-model',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function preparedVideo() {
  return {
    durationMs: 1_000,
    width: 640,
    height: 360,
    frames: Array.from({ length: 6 }, (_, index) => ({
      mimeType: 'image/jpeg' as const,
      base64: `/9j/${index}/2Q==`,
      previewUrl: `data:image/jpeg;base64,/9j/${index}/2Q==`,
      byteCount: 4,
      timeSeconds: index / 5,
    })),
  }
}

function structuredPrompt(prefix = '') {
  return {
    zh: {
      scene: `${prefix}雨夜街道，柔和霓虹灯光`,
      subject_motion: '人物向前奔跑',
      camera_motion: '镜头平稳跟拍',
      temporal_change: '雨势逐渐增强',
      transition: '',
    },
    en: {
      scene: `${prefix}A rainy street under soft neon light`,
      subject_motion: 'A person runs forward',
      camera_motion: 'The camera tracks smoothly',
      temporal_change: 'The rain gradually intensifies',
      transition: '',
    },
  }
}

async function selectVideo(user: ReturnType<typeof userEvent.setup>) {
  const workspace = screen.getByRole('region', { name: '视频转提示词' })
  await user.upload(
    within(workspace).getByLabelText('选择参考视频'),
    new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' }),
  )
  await within(workspace).findAllByRole('img', { name: /视频时间采样帧/ })
  return workspace
}

beforeEach(() => {
  vi.clearAllMocks()
  nativeMocks.cancel.mockResolvedValue(undefined)
  inputMocks.prepareVideoForPrompt.mockResolvedValue(preparedVideo())
})

describe('VideoPromptWorkspace', () => {
  it('separates and recomposes editable video motion fields in both languages', async () => {
    nativeMocks.generateFromVideo.mockResolvedValueOnce(structuredPrompt())
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />)
    const workspace = await selectVideo(user)

    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))

    expect(within(workspace).getByRole('textbox', { name: '画面基础' })).toHaveValue(
      '雨夜街道，柔和霓虹灯光',
    )
    expect(within(workspace).getByRole('textbox', { name: '主体运动' })).toHaveValue('人物向前奔跑')
    expect(within(workspace).getByRole('textbox', { name: '镜头运动' })).toHaveValue('镜头平稳跟拍')
    expect(within(workspace).getByRole('textbox', { name: '时间变化' })).toHaveValue('雨势逐渐增强')
    expect(within(workspace).getByRole('textbox', { name: '转场' })).toHaveValue('')
    const output = within(workspace).getByRole('textbox', { name: '视频提示词结果' })
    expect(output).toHaveValue('雨夜街道，柔和霓虹灯光，人物向前奔跑，镜头平稳跟拍，雨势逐渐增强')

    const subjectMotion = within(workspace).getByRole('textbox', { name: '主体运动' })
    await user.clear(subjectMotion)
    await user.type(subjectMotion, '人物缓慢转身')
    expect(output).toHaveValue('雨夜街道，柔和霓虹灯光，人物缓慢转身，镜头平稳跟拍，雨势逐渐增强')
    await user.click(within(workspace).getByRole('button', { name: '复制当前提示词' }))
    expect(writeText).toHaveBeenCalledWith(
      '雨夜街道，柔和霓虹灯光，人物缓慢转身，镜头平稳跟拍，雨势逐渐增强',
    )

    await user.click(within(workspace).getByRole('button', { name: 'EN' }))
    expect(within(workspace).getByRole('textbox', { name: '画面基础' })).toHaveValue(
      'A rainy street under soft neon light',
    )
    expect(output).toHaveValue(
      'A rainy street under soft neon light, A person runs forward, The camera tracks smoothly, The rain gradually intensifies',
    )
  })

  it('preserves a manually edited full prompt until the user explicitly recomposes it', async () => {
    nativeMocks.generateFromVideo.mockResolvedValueOnce(structuredPrompt())
    const user = userEvent.setup()
    render(<VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />)
    const workspace = await selectVideo(user)
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))

    const output = within(workspace).getByRole('textbox', { name: '视频提示词结果' })
    await user.clear(output)
    await user.type(output, '用户手动改写的完整视频提示词')
    const cameraMotion = within(workspace).getByRole('textbox', { name: '镜头运动' })
    await user.clear(cameraMotion)
    await user.type(cameraMotion, '镜头快速拉远')

    expect(output).toHaveValue('用户手动改写的完整视频提示词')
    expect(within(workspace).getByRole('status')).toHaveTextContent(
      '结构字段已更新；完整提示词含手动修改，未自动覆盖',
    )

    await user.click(within(workspace).getByRole('button', { name: '按结构重新拼装完整提示词' }))
    expect(output).toHaveValue('雨夜街道，柔和霓虹灯光，人物向前奔跑，镜头快速拉远，雨势逐渐增强')
  })

  it('aborts local frame extraction when the user cancels video processing', async () => {
    const user = userEvent.setup()
    let finishExtraction: ((value: ReturnType<typeof preparedVideo>) => void) | undefined
    inputMocks.prepareVideoForPrompt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishExtraction = resolve
        }),
    )
    render(<VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />)

    await user.upload(
      screen.getByLabelText('选择参考视频'),
      new File([new Uint8Array([1])], 'local.mp4', { type: 'video/mp4' }),
    )
    const signal = inputMocks.prepareVideoForPrompt.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(false)
    await user.click(screen.getByRole('button', { name: '取消视频处理' }))
    expect(signal.aborted).toBe(true)

    await act(async () => finishExtraction?.(preparedVideo()))
    expect(screen.queryByRole('img', { name: /视频时间采样帧/ })).not.toBeInTheDocument()
    expect(screen.getByText('已取消视频处理。')).toBeInTheDocument()
  })

  it('cancels a pending request when provider settings change and rejects its late result', async () => {
    const pending = deferred<ReturnType<typeof structuredPrompt>>()
    nativeMocks.generateFromVideo.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    const view = render(
      <VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />,
    )
    const workspace = await selectVideo(user)
    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))
    const requestId = nativeMocks.generateFromVideo.mock.calls[0][3]

    view.rerender(
      <VideoPromptWorkspace
        config={{ ...config, model: 'another-vision-model' }}
        mode="balanced"
        onOpenSettings={vi.fn()}
      />,
    )
    expect(nativeMocks.cancel).toHaveBeenCalledWith(requestId)
    expect(within(workspace).getByRole('status')).toHaveTextContent(
      'AI 设置已变化，请重新生成视频提示词',
    )

    await act(async () => {
      pending.resolve(structuredPrompt('迟到'))
      await pending.promise
    })
    expect(within(workspace).getByRole('textbox', { name: '视频提示词结果' })).toHaveValue('')
  })

  it('surfaces a bounded native string error from the configured provider', async () => {
    nativeMocks.generateFromVideo.mockRejectedValueOnce('AI 服务返回 HTTP 400。')
    const user = userEvent.setup()
    render(<VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />)
    const workspace = await selectVideo(user)

    await user.click(within(workspace).getByRole('button', { name: '生成双语提示词' }))

    expect(await within(workspace).findByRole('alert')).toHaveTextContent('AI 服务返回 HTTP 400。')
  })

  it('preserves user edits made while regeneration is pending', async () => {
    nativeMocks.generateFromVideo.mockResolvedValueOnce(structuredPrompt('初始'))
    const pending = deferred<ReturnType<typeof structuredPrompt>>()
    nativeMocks.generateFromVideo.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<VideoPromptWorkspace config={config} mode="balanced" onOpenSettings={vi.fn()} />)
    const workspace = await selectVideo(user)
    const generate = within(workspace).getByRole('button', { name: '生成双语提示词' })
    await user.click(generate)
    await user.click(generate)
    const requestId = nativeMocks.generateFromVideo.mock.calls[1][3]
    const result = within(workspace).getByRole('textbox', { name: '视频提示词结果' })

    await user.clear(result)
    await user.type(result, '用户编辑后的视频提示词')

    expect(nativeMocks.cancel).toHaveBeenCalledWith(requestId)
    await act(async () => {
      pending.resolve(structuredPrompt('迟到'))
      await pending.promise
    })
    expect(result).toHaveValue('用户编辑后的视频提示词')
  })
})
