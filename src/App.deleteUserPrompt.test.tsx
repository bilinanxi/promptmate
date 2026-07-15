import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const seededPrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'user-seeded-portrait',
  zh: '种子肖像',
  en: 'Seeded Portrait',
  description_zh: '待删除的用户词条',
  description_en: 'user prompt to delete',
  category_id: 'people-subjects',
  tags: ['人像'],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

const otherImagePrompt: PromptConcept = {
  ...seededPrompt,
  id: 'user-other-image',
  zh: '保留图片词条',
  en: 'Keep Image Prompt',
}

const videoPrompt: PromptConcept = {
  ...seededPrompt,
  id: 'user-other-video',
  zh: '保留视频词条',
  en: 'Keep Video Prompt',
  category_id: 'camera-movement',
  media_types: ['video'],
}

function seed(prompts: PromptConcept[] = [seededPrompt]) {
  localStorage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 1, prompts }))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  seed()
})

describe('delete user prompt', () => {
  it('offers deletion only for user cards and opens confirmation without mutation', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)

    expect(screen.getByRole('button', { name: '删除 种子肖像' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '删除 年轻女性' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))

    const dialog = screen.getByRole('dialog', { name: '删除词条' })
    expect(dialog).toBeVisible()
    expect(dialog).toHaveTextContent('同时从收藏、灵感篮和相关最近使用记录中移除')
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '收藏 种子肖像' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
    expect(document.querySelector('button button')).toBeNull()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '删除词条' })).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
  })

  it('traps focus, cancels on Escape without mutation, restores its opener, and inerts the workspace', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: '删除 种子肖像' })
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)
    opener.focus()

    await user.click(opener)

    const cancel = screen.getByRole('button', { name: '取消' })
    const confirm = screen.getByRole('button', { name: '确认删除 种子肖像' })
    const workspace = screen.getByTestId('app-content')
    expect(cancel).toHaveFocus()
    expect(workspace).toHaveAttribute('inert')

    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '删除词条' })).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
    expect(workspace).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
  })

  it('confirm precisely removes dependent same-media state and preserves unrelated order', async () => {
    seed([seededPrompt, otherImagePrompt, videoPrompt])
    const now = Date.now() - 1000
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        favorites: [
          { mediaType: 'image', promptId: seededPrompt.id },
          { mediaType: 'image', promptId: otherImagePrompt.id },
          { mediaType: 'video', promptId: videoPrompt.id },
        ],
      }),
    )
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'delete-target',
            mediaType: 'image',
            promptIds: [seededPrompt.id],
            language: 'zh',
            copiedText: 'delete target',
            usedAt: now,
          },
          {
            id: 'keep-image',
            mediaType: 'image',
            promptIds: [otherImagePrompt.id],
            language: 'zh',
            copiedText: 'keep image',
            usedAt: now - 1,
          },
          {
            id: 'keep-video',
            mediaType: 'video',
            promptIds: [videoPrompt.id],
            language: 'en',
            copiedText: 'keep video',
            usedAt: now - 2,
          },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^种子肖像，/ }))
    await user.click(screen.getByRole('button', { name: /^保留图片词条，/ }))
    const output = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(output)
    await user.type(output, '手动输出')

    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))

    expect(screen.getByRole('button', { name: '新建词条' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /^种子肖像，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('保留图片词条。')
    expect(screen.getByRole('button', { name: '我的词条' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('词条已从本机删除。')).toHaveAttribute('role', 'status')
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [otherImagePrompt, videoPrompt],
    })
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual({
      version: 1,
      favorites: [
        { mediaType: 'image', promptId: otherImagePrompt.id },
        { mediaType: 'video', promptId: videoPrompt.id },
      ],
    })
    expect(JSON.parse(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)!)).toEqual({
      version: 1,
      records: [
        {
          id: 'keep-image',
          mediaType: 'image',
          promptIds: [otherImagePrompt.id],
          language: 'zh',
          copiedText: 'keep image',
          usedAt: now - 1,
        },
        {
          id: 'keep-video',
          mediaType: 'video',
          promptIds: [videoPrompt.id],
          language: 'en',
          copiedText: 'keep video',
          usedAt: now - 2,
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.queryByRole('button', { name: '从灵感篮移除 种子肖像' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
  })

  it('durably stays absent after remount and shows the final user-source empty state', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))
    expect(screen.getByText('还没有我的词条')).toBeVisible()
    view.unmount()
    render(<App />)
    expect(screen.queryByRole('button', { name: /^种子肖像，/ })).not.toBeInTheDocument()
  })

  it('persists each cleanup independently when one setItem write fails', async () => {
    seed([seededPrompt, otherImagePrompt])
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        favorites: [{ mediaType: 'image', promptId: seededPrompt.id }],
      }),
    )
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'delete-recent',
            mediaType: 'image',
            promptIds: [seededPrompt.id],
            language: 'zh',
            copiedText: 'delete',
            usedAt: Date.now() - 1000,
          },
        ],
      }),
    )
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === FAVORITES_STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    const user = userEvent.setup()
    render(<App />)
    try {
      await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
      await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))
    } finally {
      write.mockRestore()
    }
    expect(screen.queryByRole('button', { name: /^种子肖像，/ })).not.toBeInTheDocument()
    expect(screen.getByText('词条已从当前会话删除，但部分本地数据可能未保存。')).toHaveAttribute(
      'role',
      'status',
    )
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [otherImagePrompt],
    })
    expect(JSON.parse(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)!)).toEqual({
      version: 1,
      records: [],
    })
  })

  it('deletes in memory when localStorage acquisition fails and restores its descriptor', async () => {
    seed([seededPrompt, otherImagePrompt])
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
      await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
      else Reflect.deleteProperty(window, 'localStorage')
    }
    expect(screen.queryByRole('button', { name: /^种子肖像，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^保留图片词条，/ })).toBeVisible()
    expect(screen.getByText('词条已从当前会话删除，但部分本地数据可能未保存。')).toBeVisible()
  })

  it('preserves manual output when the deleted prompt was not selected', async () => {
    seed([seededPrompt, otherImagePrompt])
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^保留图片词条，/ }))
    const output = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(output)
    await user.type(output, '保留手动输出')
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('保留手动输出')
  })

  it('closes confirmation on media switch and keeps video data isolated', async () => {
    seed([seededPrompt, videoPrompt])
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.queryByRole('dialog', { name: '删除词条' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^保留视频词条，/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '图片' }))
    await user.click(screen.getByRole('button', { name: '删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '确认删除 种子肖像' }))
    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.getByRole('button', { name: /^保留视频词条，/ })).toBeVisible()
  })
})
