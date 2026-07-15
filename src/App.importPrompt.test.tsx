import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { MAX_IMPORT_BYTES } from './features/prompt-library/parsePromptImport'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import { serializePromptCsv } from './features/prompt-library/promptCsv'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const existingUser: PromptConcept = {
  schema_version: '1.0',
  id: 'user-existing',
  zh: '已有词条',
  en: 'existing prompt',
  description_zh: '保留顺序。',
  description_en: 'Preserve order.',
  category_id: 'people-subjects',
  tags: [],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

const externalRecord = {
  schema_version: '1.0',
  id: 'community-neon-rain',
  zh: '霓虹雨夜',
  en: 'neon rainy night',
  description_zh: '社区分享的雨夜氛围。',
  description_en: 'A community shared rainy-night mood.',
  category_id: 'lighting-atmosphere',
  tags: ['电影感'],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'builtin',
  status: 'pending',
}

function jsonlFile(record: object = externalRecord) {
  return new File([JSON.stringify(record)], 'community.jsonl', {
    type: 'application/x-ndjson',
  })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    USER_PROMPTS_STORAGE_KEY,
    JSON.stringify({ version: 1, prompts: [existingUser] }),
  )
})

describe('JSONL prompt import tracer', () => {
  it('rejects an oversized file before starting a renderer read', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const file = jsonlFile()
    Object.defineProperty(file, 'size', { configurable: true, value: MAX_IMPORT_BYTES + 1 })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(within(dialog).getByLabelText('选择 JSONL 文件'), file)

    expect(within(dialog).getByRole('alert')).toHaveTextContent('文件不能超过 5242880 字节')
    expect(read).not.toHaveBeenCalled()
    read.mockRestore()
  })

  it('keeps the latest selection when an older asynchronous read finishes later', async () => {
    const originalRead = FileReader.prototype.readAsArrayBuffer
    const read = vi
      .spyOn(FileReader.prototype, 'readAsArrayBuffer')
      .mockImplementation(function delayedRead(this: FileReader, file: Blob) {
        if (file instanceof File && file.name === 'older.jsonl') {
          window.setTimeout(() => originalRead.call(this, file), 40)
          return
        }
        originalRead.call(this, file)
      })
    const older = jsonlFile({ ...externalRecord, id: 'older', zh: '较旧选择' })
    const latest = jsonlFile({ ...externalRecord, id: 'latest', zh: '最新选择' })
    Object.defineProperty(older, 'name', { configurable: true, value: 'older.jsonl' })
    Object.defineProperty(latest, 'name', { configurable: true, value: 'latest.jsonl' })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    const picker = within(dialog).getByLabelText('选择 JSONL 文件')
    await user.upload(picker, older)
    await user.upload(picker, latest)

    expect(await within(dialog).findByText('最新选择')).toBeVisible()
    await new Promise((resolve) => window.setTimeout(resolve, 80))
    expect(within(dialog).getByText('最新选择')).toBeVisible()
    expect(within(dialog).queryByText('较旧选择')).not.toBeInTheDocument()
    read.mockRestore()
  })

  it('aborts and invalidates an active file read when the app unmounts', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => {})
    const abort = vi.spyOn(FileReader.prototype, 'abort')
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    await user.upload(screen.getByLabelText('选择 JSONL 文件'), jsonlFile())
    expect(read).toHaveBeenCalledOnce()

    unmount()

    expect(abort).toHaveBeenCalledOnce()
    read.mockRestore()
    abort.mockRestore()
  })

  it('previews normalization and durably applies once without mutating other collections', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const view = render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(within(dialog).getByLabelText('选择 JSONL 文件'), jsonlFile())

    expect(await within(dialog).findByText('霓虹雨夜')).toBeVisible()
    expect(within(dialog).getByText('neon rainy night')).toBeVisible()
    expect(within(dialog).getByText('图片 · 灯光氛围 · 社区导入')).toBeVisible()
    expect(
      within(dialog).getByText(
        /共 1 行，0 个错误；新增 1 · 跳过 0 · 替换 0 · 副本 0 · 阻断 0；导入后共 2 条/,
      ),
    ).toBeVisible()

    setItem.mockClear()
    await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith(USER_PROMPTS_STORAGE_KEY, expect.any(String))
    const payload = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)
    expect(payload).toEqual({
      version: 2,
      prompts: [existingUser, { ...externalRecord, source: 'imported', status: 'approved' }],
    })
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toBeNull()
    expect(screen.getByText('已成功导入 1 条社区词条。')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /^霓虹雨夜，neon rainy night，/ })).toBeVisible()

    view.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '社区导入' }))
    expect(screen.getByRole('button', { name: /^霓虹雨夜，neon rainy night，/ })).toBeVisible()
    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), 'rainy')
    expect(screen.getByRole('button', { name: /^霓虹雨夜，neon rainy night，/ })).toBeVisible()
  })

  it('keeps the preview and catalog unchanged when the transactional write fails', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(within(dialog).getByLabelText('选择 JSONL 文件'), jsonlFile())
    await within(dialog).findByText('霓虹雨夜')
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    try {
      await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('导入未保存，请重试')
      expect(within(dialog).getByText('霓虹雨夜')).toBeVisible()
      expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
      expect(
        screen.queryByRole('button', { name: /^霓虹雨夜，neon rainy night，/ }),
      ).not.toBeInTheDocument()
    } finally {
      setItem.mockRestore()
    }
  })

  it('keeps the preview and catalog unchanged when localStorage access starts failing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(within(dialog).getByLabelText('选择 JSONL 文件'), jsonlFile())
    await within(dialog).findByText('霓虹雨夜')
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked')
      },
    })

    try {
      await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent('导入未保存，请重试')
      expect(await within(dialog).findByText('霓虹雨夜')).toBeVisible()
      expect(
        screen.queryByRole('button', { name: /^霓虹雨夜，neon rainy night，/ }),
      ).not.toBeInTheDocument()
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
    }
  })

  it('recomputes conflict policy without rereading and applies the exact replacement in one write', async () => {
    const replacement = {
      ...externalRecord,
      id: existingUser.id,
      zh: '替换后的词条',
      en: 'replaced existing prompt',
    }
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify({ version: 1, favorites: [`image:${existingUser.id}`] }),
    )
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'recent-existing',
            mediaType: 'image',
            promptIds: [existingUser.id],
            language: 'zh',
            copiedText: '手工保留的构图',
            usedAt: Date.now(),
          },
        ],
      }),
    )
    const favoritesBefore = localStorage.getItem(FAVORITES_STORAGE_KEY)
    const recentBefore = localStorage.getItem(RECENT_USAGE_STORAGE_KEY)
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(within(dialog).getByLabelText('选择 JSONL 文件'), jsonlFile(replacement))

    expect(await within(dialog).findByText('跳过')).toBeVisible()
    expect(within(dialog).getByText(/新增 0 · 跳过 1 · 替换 0 · 副本 0 · 阻断 0/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '确认导入 0 条' })).toBeDisabled()

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '重复项处理' }),
      'replace',
    )

    expect(within(dialog).getByText('替换')).toBeVisible()
    expect(within(dialog).getByText(/新增 0 · 跳过 0 · 替换 1 · 副本 0 · 阻断 0/)).toBeVisible()
    expect(read).toHaveBeenCalledTimes(1)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))

    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [
        {
          ...replacement,
          id: existingUser.id,
          source: existingUser.source,
          media_types: existingUser.media_types,
          status: 'approved',
        },
      ],
    })
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe(favoritesBefore)
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toBe(recentBefore)
  })

  it('enters focus, traps Tab, cancels with Escape, restores focus, and blocks erroneous apply', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: '导入与导出' })
    opener.focus()
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    const fileInput = within(dialog).getByLabelText('选择 JSONL 文件')
    expect(fileInput).toHaveFocus()
    expect(screen.getByTestId('app-content')).toHaveAttribute('inert')

    await user.upload(fileInput, new File(['{"id":'], 'broken.jsonl'))
    expect(await within(dialog).findByRole('alert')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '确认导入 0 条' })).toBeDisabled()

    const close = within(dialog).getByRole('button', { name: '关闭导入与导出' })
    const report = within(dialog).getByRole('button', { name: '下载导入报告' })
    close.focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(report).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(dialog).not.toBeInTheDocument()
    expect(screen.getByTestId('app-content')).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toContain('"version":1')
  })
})

describe('CSV prompt import tracer', () => {
  it('accepts CSV, previews normalization, and applies through the existing transaction', async () => {
    const user = userEvent.setup()
    const file = new File(
      [serializePromptCsv([externalRecord as PromptConcept])],
      'community.csv',
      { type: 'text/csv' },
    )
    const write = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    const picker = within(dialog).getByLabelText('选择 JSONL 文件')
    expect(picker).toHaveAttribute('accept', expect.stringContaining('.csv'))
    await user.upload(picker, file)

    expect(await within(dialog).findByText('霓虹雨夜')).toBeVisible()
    expect(within(dialog).getByText('图片 · 灯光氛围 · 社区导入')).toBeVisible()
    write.mockClear()
    await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))

    expect(write).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)
    expect(payload.prompts.at(-1)).toEqual({
      ...externalRecord,
      source: 'imported',
      status: 'approved',
    })
  })
})

describe('PromptMate package import tracer', () => {
  it('infers the package by filename, previews the preserved user source, and applies transactionally', async () => {
    const user = userEvent.setup()
    const packageRecord = { ...externalRecord, id: 'portable-user', source: 'user' }
    const file = new File(
      [
        JSON.stringify({
          format: 'promptmate.prompt-package',
          package_version: 1,
          prompt_schema_version: '1.0',
          prompts: [packageRecord],
        }),
      ],
      'portable.promptmate.json',
      { type: 'application/json' },
    )
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    const picker = within(dialog).getByLabelText('选择 JSONL 文件')
    expect(picker).toHaveAttribute('accept', expect.stringContaining('.promptmate.json'))
    await user.upload(picker, file)

    expect(await within(dialog).findByText('霓虹雨夜')).toBeVisible()
    expect(within(dialog).getByText('图片 · 灯光氛围 · 我的词条')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: '确认导入 1 条' }))

    const payload = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)
    expect(payload.prompts.at(-1)).toEqual({ ...packageRecord, source: 'user', status: 'approved' })
  })

  it('shows a visible error for an unknown extension instead of guessing', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })

    await user.upload(
      within(dialog).getByLabelText('选择 JSONL 文件'),
      new File([JSON.stringify(externalRecord)], 'community.json'),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '仅支持 .jsonl、.csv 或 .promptmate.json 文件',
    )
    expect(within(dialog).getByRole('button', { name: '确认导入 0 条' })).toBeDisabled()
  })
})
