import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AI_PROVIDER_STORAGE_KEY } from './features/ai/aiProviderConfig'

const aiMocks = vi.hoisted(() => ({
  saveApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  hasApiKey: vi.fn(),
  testConnection: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('./features/ai/aiNativeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./features/ai/aiNativeClient')>()),
  aiNativeClient: aiMocks,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  aiMocks.hasApiKey.mockResolvedValue(false)
  aiMocks.saveApiKey.mockResolvedValue(undefined)
  aiMocks.deleteApiKey.mockResolvedValue(undefined)
  aiMocks.testConnection.mockResolvedValue('连接成功')
  aiMocks.cancel.mockResolvedValue(undefined)
  aiMocks.complete.mockResolvedValue({
    description_zh: 'AI 中文描述',
    description_en: 'AI English description',
    tags: ['雨夜', '人像'],
    aliases_zh: ['夜雨肖像'],
    aliases_en: ['rain portrait'],
  })
})

describe('AI provider settings', () => {
  it('stores only non-secret config and saves the key through Windows credential commands', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'AI 设置' }))
    const dialog = screen.getByRole('dialog', { name: 'AI 提供商设置' })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'AI 提供商' }), 'ollama')
    expect(within(dialog).getByRole('textbox', { name: '服务地址' })).toHaveValue(
      'http://127.0.0.1:11434/v1',
    )
    await user.type(within(dialog).getByRole('textbox', { name: '模型名称' }), 'qwen3')
    await user.type(within(dialog).getByLabelText('API Key（可选）'), 'credential-secret')
    await user.click(within(dialog).getByRole('button', { name: '保存设置' }))

    const expected = {
      version: 1,
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen3',
    }
    expect(aiMocks.saveApiKey).toHaveBeenCalledWith(expected, 'credential-secret')
    expect(JSON.parse(localStorage.getItem(AI_PROVIDER_STORAGE_KEY)!)).toEqual(expected)
    expect(localStorage.getItem(AI_PROVIDER_STORAGE_KEY)).not.toContain('credential-secret')
    expect(within(dialog).getByRole('status')).toHaveTextContent('设置已保存')

    await user.click(within(dialog).getByRole('button', { name: '测试连接' }))
    expect(aiMocks.testConnection).toHaveBeenCalledWith(expected)
    expect(within(dialog).getByRole('status')).toHaveTextContent('连接成功')
  })

  it('does not write a credential when non-secret config persistence fails', async () => {
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === AI_PROVIDER_STORAGE_KEY) throw new Error('storage unavailable')
      return originalSetItem.call(this, key, value)
    })
    try {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'AI 设置' }))
      const dialog = screen.getByRole('dialog', { name: 'AI 提供商设置' })
      await user.clear(within(dialog).getByRole('textbox', { name: '模型名称' }))
      await user.type(within(dialog).getByRole('textbox', { name: '模型名称' }), 'example-model')
      await user.type(within(dialog).getByLabelText('API Key（可选）'), 'not-persisted')
      await user.click(within(dialog).getByRole('button', { name: '保存设置' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('设置无法保存到本机')
      expect(aiMocks.saveApiKey).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
    }
  })

  it('prevents closing while a credential mutation is pending', async () => {
    const pending = deferred<void>()
    aiMocks.saveApiKey.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'AI 设置' }))
    const dialog = screen.getByRole('dialog', { name: 'AI 提供商设置' })
    await user.clear(within(dialog).getByRole('textbox', { name: '模型名称' }))
    await user.type(within(dialog).getByRole('textbox', { name: '模型名称' }), 'example-model')
    await user.type(within(dialog).getByLabelText('API Key（可选）'), 'pending-value')
    await user.click(within(dialog).getByRole('button', { name: '保存设置' }))

    const close = within(dialog).getByRole('button', { name: '关闭 AI 提供商设置' })
    expect(close).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog).toBeInTheDocument()

    await act(async () => pending.resolve())
    expect(await within(dialog).findByRole('status')).toHaveTextContent('设置已保存')
    expect(close).toBeEnabled()
  })
})

describe('AI field completion', () => {
  it('redacts a credential if native saving fails', async () => {
    const secret = ['temporary', 'credential', 'value'].join('-')
    aiMocks.saveApiKey.mockRejectedValueOnce(new Error(`native failure: ${secret}`))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'AI 设置' }))
    const dialog = screen.getByRole('dialog', { name: 'AI 提供商设置' })
    await user.clear(within(dialog).getByRole('textbox', { name: '模型名称' }))
    await user.type(within(dialog).getByRole('textbox', { name: '模型名称' }), 'example-model')
    await user.type(within(dialog).getByLabelText('API Key（可选）'), secret)
    await user.click(within(dialog).getByRole('button', { name: '保存设置' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('[REDACTED]')
    expect(alert).not.toHaveTextContent(secret)
    const stored = localStorage.getItem(AI_PROVIDER_STORAGE_KEY)
    expect(JSON.parse(stored!)).toMatchObject({ model: 'example-model' })
    expect(stored).not.toContain(secret)
  })

  it('saves a newly entered credential before testing the connection', async () => {
    const credential = ['temporary', 'test', 'value'].join('-')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'AI 设置' }))
    const dialog = screen.getByRole('dialog', { name: 'AI 提供商设置' })
    await user.clear(within(dialog).getByRole('textbox', { name: '模型名称' }))
    await user.type(within(dialog).getByRole('textbox', { name: '模型名称' }), 'example-model')
    await user.type(within(dialog).getByLabelText('API Key（可选）'), credential)
    await user.click(within(dialog).getByRole('button', { name: '测试连接' }))

    expect(aiMocks.saveApiKey).toHaveBeenCalledTimes(1)
    expect(aiMocks.testConnection).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(AI_PROVIDER_STORAGE_KEY)!)).toMatchObject({
      model: 'example-model',
    })
    expect(aiMocks.saveApiKey.mock.invocationCallOrder[0]).toBeLessThan(
      aiMocks.testConnection.mock.invocationCallOrder[0],
    )
    expect(await within(dialog).findByRole('status')).toHaveTextContent('连接成功')
  })

  it('previews suggestions and does not overwrite filled fields unless selected', async () => {
    localStorage.setItem(
      AI_PROVIDER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        kind: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'example-model',
      }),
    )
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '雨夜人像')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'Rainy night portrait')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '用户中文描述')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: 'AI 补全' }))

    expect(aiMocks.complete).toHaveBeenCalledTimes(1)
    const preview = await screen.findByRole('group', { name: 'AI 补全预览' })
    expect(within(preview).getByRole('checkbox', { name: '采用中文描述' })).not.toBeChecked()
    expect(within(preview).getByRole('checkbox', { name: '采用英文描述' })).toBeChecked()
    await user.click(within(preview).getByRole('button', { name: '应用所选内容' }))

    expect(screen.getByRole('textbox', { name: '中文描述（可选）' })).toHaveValue('用户中文描述')
    expect(screen.getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue(
      'AI English description',
    )
    expect(screen.getByRole('textbox', { name: '标签（可选）' })).toHaveValue('雨夜, 人像')
    expect(screen.queryByRole('group', { name: 'AI 补全预览' })).not.toBeInTheDocument()
  })

  it('cancels stale requests and protects fields edited while a request is pending', async () => {
    localStorage.setItem(
      AI_PROVIDER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        kind: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'example-model',
      }),
    )
    const pending = deferred<{
      description_zh: string
      description_en: string
      tags: string[]
      aliases_zh: string[]
      aliases_en: string[]
    }>()
    aiMocks.complete.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '雨夜人像')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'Rainy night portrait')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: 'AI 补全' }))
    await user.type(screen.getByRole('textbox', { name: '英文描述（可选）' }), '用户后写的描述')
    await user.click(screen.getByRole('button', { name: '取消 AI 补全' }))
    expect(aiMocks.cancel).toHaveBeenCalledTimes(1)
    expect(aiMocks.cancel).toHaveBeenCalledWith(expect.stringMatching(/^completion-/))

    await act(async () => {
      pending.resolve({
        description_zh: 'AI 中文描述',
        description_en: 'AI English description',
        tags: ['雨夜'],
        aliases_zh: [],
        aliases_en: [],
      })
      await pending.promise
    })

    expect(screen.queryByRole('group', { name: 'AI 补全预览' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue('用户后写的描述')
    expect(aiMocks.complete).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite a field changed after the preview appeared', async () => {
    localStorage.setItem(
      AI_PROVIDER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        kind: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'example-model',
      }),
    )
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '雨夜人像')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'Rainy night portrait')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: 'AI 补全' }))
    const preview = await screen.findByRole('group', { name: 'AI 补全预览' })

    await user.type(screen.getByRole('textbox', { name: '英文描述（可选）' }), '用户稍后填写')
    await user.click(within(preview).getByRole('button', { name: '应用所选内容' }))

    expect(screen.getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue('用户稍后填写')
    expect(screen.getByRole('alert')).toHaveTextContent('英文描述')
    expect(within(preview).getByRole('checkbox', { name: '采用英文描述' })).not.toBeChecked()
  })
})
