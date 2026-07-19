import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import type { PromptConcept } from './features/prompt-library/types'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

beforeEach(() => {
  localStorage.clear()
})

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('PromptMate workspace', () => {
  it('loads more prompt cards automatically while scrolling without a button', async () => {
    let intersectionCallback: IntersectionObserverCallback = () => undefined
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    const { container } = render(<App />)

    expect(container.querySelectorAll('.prompt-card')).toHaveLength(48)
    expect(screen.queryByRole('button', { name: /加载更多词条/ })).not.toBeInTheDocument()

    await act(() =>
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )

    expect(container.querySelectorAll('.prompt-card')).toHaveLength(96)
    expect(observe).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalled()
  })

  it('keeps managed prompts ahead of builtins in the scrolling library', () => {
    const prompts: PromptConcept[] = Array.from({ length: 60 }, (_, index) => ({
      schema_version: '1.0',
      id: `user-batch-${index + 1}`,
      zh: `批量用户词条 ${index + 1}`,
      en: `managed prompt ${index + 1}`,
      description_zh: '',
      description_en: '',
      category_id: 'people-subjects',
      tags: [],
      aliases_zh: [],
      aliases_en: [],
      media_types: ['image'],
      source: index % 2 === 0 ? 'user' : 'imported',
      status: 'approved',
    }))
    localStorage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 2, prompts }))

    const { container } = render(<App />)

    expect(container.querySelectorAll('.prompt-card')).toHaveLength(48)
    expect(screen.getByRole('button', { name: /^批量用户词条 48，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^批量用户词条 49，/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
  })

  it('shows only contextual secondary filters inside a parent category', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '动作姿态' }))

    expect(screen.queryByRole('button', { name: '人物' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '服装' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '动作' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成人向' })).toBeVisible()
    expect(screen.getByRole('button', { name: '截图整理' })).toBeVisible()
  })

  it('clears a stale secondary filter when switching parent categories', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'YouMind整理' }))
    await user.click(screen.getByRole('button', { name: '动作姿态' }))

    expect(screen.getByRole('button', { name: '动作姿态' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'YouMind整理' })).not.toBeInTheDocument()
    expect(screen.getByText('找到 429 个词条')).toBeVisible()
    expect(screen.getByRole('button', { name: /行走中回眸，/ })).toBeVisible()
  })

  it('toggles a prompt favorite without mutating the inspiration basket', async () => {
    const user = userEvent.setup()
    render(<App />)

    const favorite = screen.getByRole('button', { name: '收藏 年轻女性' })
    expect(favorite).toHaveAttribute('aria-pressed', 'false')

    await user.click(favorite)

    expect(screen.getByRole('button', { name: '取消收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByText('点击任意词条卡片，把灵感放进来。')).toBeVisible()
  })

  it('isolates favorites by media and restores each media selection after switching', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '视频' }))

    expect(screen.getByRole('button', { name: '收藏 缓慢推进镜头' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await user.click(screen.getByRole('button', { name: '收藏 缓慢推进镜头' }))

    await user.click(screen.getByRole('button', { name: '图片' }))
    expect(screen.getByRole('button', { name: '取消收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.getByRole('button', { name: '取消收藏 缓慢推进镜头' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('clears active criteria when returning to browse all', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '场景环境' }))
    expect(screen.getByText('找到 310 个词条')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '浏览全部灵感' }))

    expect(screen.getByText('正在展示 3159 个精选词条')).toBeVisible()
    expect(screen.getByRole('button', { name: '场景环境' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows an active-media favorites view with a dynamic count and useful zero state', async () => {
    const user = userEvent.setup()
    render(<App />)

    const favoritesView = screen.getByRole('button', { name: '我的收藏，0 个' })
    await user.click(favoritesView)

    expect(screen.getByRole('heading', { name: '我的收藏' })).toBeVisible()
    expect(screen.getByRole('button', { name: '为你推荐' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('还没有收藏图片提示词')).toBeVisible()
    expect(screen.getByText('浏览词库并点击星标，把常用灵感保存在这里。')).toBeVisible()

    await user.click(
      within(screen.getByRole('navigation', { name: '提示词分类' })).getByRole('button', {
        name: '浏览全部灵感',
      }),
    )
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    expect(screen.getByRole('button', { name: '我的收藏，1 个' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '我的收藏，1 个' }))
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^霓虹雨夜街道，/ })).not.toBeInTheDocument()
  })

  it('searches within the active favorites view', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '收藏 霓虹雨夜街道' }))
    await user.click(screen.getByRole('button', { name: '我的收藏，2 个' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '雨')

    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 个词条')).toBeVisible()
  })

  it('shows a searchable empty state without claiming existing favorites are missing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '我的收藏，1 个' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '不存在')

    expect(screen.getByText('没有找到匹配的收藏')).toBeVisible()
    expect(screen.queryByText('还没有收藏图片提示词')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(screen.getByRole('heading', { name: '我的收藏' })).toBeVisible()
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
  })

  it('removes an unfavorited prompt from the favorites view without changing the basket', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '我的收藏，1 个' }))
    await user.click(screen.getByRole('button', { name: '取消收藏 年轻女性' }))

    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByText('还没有收藏图片提示词')).toBeVisible()
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' })).toBeVisible()
  })

  it('restores favorites after an app remount', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App />)

    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    firstRender.unmount()
    render(<App />)

    expect(screen.getByRole('button', { name: '取消收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '我的收藏，1 个' })).toBeVisible()
  })

  it('starts safely with malformed or unsupported persisted favorites', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ version: 99, favorites: [] }))

    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByRole('button', { name: '我的收藏，0 个' })).toBeVisible()
    expect(screen.getByRole('button', { name: '收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('keeps favorite interaction working when localStorage writes fail', async () => {
    const user = userEvent.setup()
    render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))

    expect(screen.getByRole('button', { name: '取消收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
  })

  it('supports keyboard favorite toggling without nested buttons', async () => {
    const user = userEvent.setup()
    render(<App />)
    const favorite = screen.getByRole('button', { name: '收藏 年轻女性' })

    favorite.focus()
    await user.keyboard('{Enter}')

    expect(favorite).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('button button')).toBeNull()
  })

  it('copies the exact manually edited composition including Chinese and English text', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    const editor = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(editor)
    await user.type(editor, '年轻女性 with cinematic light — 保留空格')
    expect(editor).toHaveValue('年轻女性 with cinematic light — 保留空格')
    const copyButton = screen.getByRole('button', { name: '复制提示词' })
    expect(copyButton).toBeEnabled()
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('年轻女性 with cinematic light — 保留空格')
  })

  it('resets manual edits after basket mutation and language changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    const editor = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(editor)
    await user.type(editor, '手动修改 manual edit')

    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    expect(editor).toHaveValue('年轻女性，霓虹雨夜街道。')

    await user.clear(editor)
    await user.type(editor, 'manual order edit')
    await user.click(screen.getByRole('button', { name: '下移 年轻女性' }))
    expect(editor).toHaveValue('霓虹雨夜街道，年轻女性。')

    await user.clear(editor)
    await user.type(editor, 'another manual edit')
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(editor).toHaveValue('neon-lit rainy street, young woman.')
  })

  it('disables copy when the edited composition is only whitespace', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    const editor = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(editor)
    await user.type(editor, '   \n  ')

    expect(screen.getByRole('button', { name: '复制提示词' })).toBeDisabled()
  })

  it('announces successful copy and returns to idle after a short timeout', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    vi.useFakeTimers()
    mockClipboard(writeText)
    fireEvent.click(screen.getByRole('button', { name: '复制提示词' }))
    await act(async () => Promise.resolve())

    expect(screen.getByRole('status')).toHaveTextContent('已复制到剪贴板')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an alert after a rejected copy and succeeds on retry without false success', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    const copyButton = screen.getByRole('button', { name: '复制提示词' })
    await user.click(copyButton)

    expect(screen.getByRole('alert')).toHaveTextContent('复制失败')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()

    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已复制到剪贴板')
  })

  it('shows an error and never success when the clipboard API is unavailable', async () => {
    const user = userEvent.setup()
    Reflect.deleteProperty(navigator, 'clipboard')
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))

    expect(screen.getByRole('alert')).toHaveTextContent('复制失败')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()
  })

  it('adds recent usage only when a pending clipboard promise resolves successfully', async () => {
    let resolveCopy!: () => void
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve
        }),
    )
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制提示词' }))
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toBeNull()

    await act(async () => resolveCopy())
    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toContain('年轻女性。')
  })

  it('ignores a pending clipboard completion after unmounting', async () => {
    let resolveCopy!: () => void
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve
        }),
    )
    const user = userEvent.setup()
    mockClipboard(writeText)
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()
    unmount()

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    await act(async () => resolveCopy())

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toBeNull()
  })

  it('clears stale copy feedback when the result is edited or regenerated', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    expect(screen.getByRole('status')).toBeVisible()

    await user.type(screen.getByRole('textbox', { name: '编辑拼装结果' }), ' edited')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('presents the prompt library as the primary workspace', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '灵感词库' })).toBeVisible()
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByText('适合人像、时尚和叙事画面的通用主体。')).toBeVisible()
    expect(within(screen.getByRole('main')).getAllByText('内置精选')).toHaveLength(48)
    expect(screen.getByText('灵感篮')).toBeVisible()
  })

  it('adds a prompt card to the basket and composes the Chinese prompt', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('1')
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('年轻女性。')
  })

  it('clears a nonempty basket and undoes the clear exactly', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('button', { name: '清空灵感篮' })).not.toBeInTheDocument()

    const womanCard = screen.getByRole('button', { name: /^年轻女性，/ })
    const streetCard = screen.getByRole('button', { name: /^霓虹雨夜街道，/ })
    await user.click(womanCard)
    await user.click(streetCard)
    await user.click(screen.getByRole('button', { name: '清空灵感篮' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.queryByRole('button', { name: '清空灵感篮' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '从灵感篮移除 年轻女性' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('自动拼装结果')).toHaveTextContent(
      '从词库选择词条，这里会自动组合。',
    )
    expect(womanCard).toHaveAttribute('aria-pressed', 'false')
    expect(streetCard).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' })).toBeVisible()
    expect(screen.getByRole('button', { name: '从灵感篮移除 霓虹雨夜街道' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      '年轻女性，霓虹雨夜街道。',
    )
    expect(womanCard).toHaveAttribute('aria-pressed', 'true')
    expect(streetCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '撤销上一步灵感篮操作' })).toBeDisabled()
  })

  it('reorders selected prompts with accessible boundary controls and undoes the reorder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))

    expect(screen.getByRole('button', { name: '上移 年轻女性' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下移 年轻女性' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '上移 霓虹雨夜街道' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '下移 霓虹雨夜街道' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下移 年轻女性' }))

    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      '霓虹雨夜街道，年轻女性。',
    )
    expect(screen.getByRole('button', { name: '上移 霓虹雨夜街道' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下移 年轻女性' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      'neon-lit rainy street, young woman.',
    )

    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      'young woman, neon-lit rainy street.',
    )
  })

  it('undoes the latest add or remove mutation with one-level history', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))

    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('年轻女性。')
    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '撤销上一步灵感篮操作' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' }))
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')

    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('年轻女性。')
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('removes one selected prompt from the basket and updates the composition', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    await user.click(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('1')
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('霓虹雨夜街道。')
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('restores the empty basket after removing the final selected prompt', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByText('点击任意词条卡片，把灵感放进来。')).toBeVisible()
    expect(screen.getByLabelText('自动拼装结果')).toHaveTextContent(
      '从词库选择词条，这里会自动组合。',
    )
    expect(screen.getByRole('button', { name: '复制提示词' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('updates the English composition after removing a selected prompt', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    await user.click(screen.getByRole('button', { name: 'EN' }))
    await user.click(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' }))

    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      'neon-lit rainy street.',
    )
  })

  it('switches the composed prompt to English', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('young woman.')
  })

  it('combines multiple selected cards in library order', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('2')
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      '年轻女性，霓虹雨夜街道。',
    )
  })

  it('searches names, descriptions, aliases, tags, categories, and media types', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    await user.type(search, '现代水墨')

    expect(screen.getByRole('button', { name: /^当代水墨气质，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByText('找到 1 个词条')).toBeVisible()
  })

  it('shows an empty result and restores the library after clearing search', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '不存在的词条')

    expect(screen.getByText('没有找到匹配的词条')).toBeVisible()
    expect(screen.getByText('找到 0 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '清除搜索' }))

    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByText('正在展示 3159 个精选词条')).toBeVisible()
  })

  it('focuses search with Ctrl+K and clears it with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    await user.keyboard('{Control>}k{/Control}')
    expect(search).toHaveFocus()

    await user.type(search, '电影感')
    await user.keyboard('{Escape}')

    expect(search).toHaveValue('')
    expect(screen.getByText('正在展示 3159 个精选词条')).toBeVisible()
  })

  it('filters the library by category and restores all prompts through browse all', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '场景环境' }))

    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^静谧中式庭院，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '场景环境' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('找到 310 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '浏览全部灵感' }))

    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByText('正在展示 3159 个精选词条')).toBeVisible()
  })

  it('filters the library by tag and clears the tag with All', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '电影感' }))

    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^克制的电影感，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '电影感' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '全部' }))

    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles an exact source filter', async () => {
    const user = userEvent.setup()
    render(<App />)
    const myPrompts = screen.getByRole('button', { name: '我的词条' })

    await user.click(myPrompts)

    expect(myPrompts).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('还没有我的词条')).toBeVisible()
    expect(screen.getByText('找到 0 个词条')).toBeVisible()

    await user.click(myPrompts)

    expect(myPrompts).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
  })

  it('switches to the validated video library and resets media-specific state', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '场景环境' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '雨')
    await user.click(screen.getByRole('button', { name: '视频' }))

    expect(screen.getByRole('button', { name: /^缓慢推进镜头，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '搜索提示词' })).toHaveValue('')
    expect(screen.getByRole('button', { name: '浏览全部灵感' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '视频' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shuffles through disjoint recommendation halves without changing basket or favorites', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '为你推荐' }))
    expect(
      within(screen.getByRole('main')).getAllByRole('button', { name: /加入灵感篮/ }),
    ).toHaveLength(6)
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^柔和侧逆光，/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '换一批' }))

    expect(
      within(screen.getByRole('main')).getAllByRole('button', { name: /加入灵感篮/ }),
    ).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^柔和侧逆光，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '从灵感篮移除 年轻女性' })).toBeVisible()
    expect(screen.getByRole('button', { name: '我的收藏，1 个' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '换一批' }))
    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '取消收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows four recommendations in each disjoint video batch', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '视频' }))
    await user.click(screen.getByRole('button', { name: '为你推荐' }))
    expect(
      within(screen.getByRole('main')).getAllByRole('button', { name: /加入灵感篮/ }),
    ).toHaveLength(4)
    expect(screen.getByRole('button', { name: /^缓慢推进镜头，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^日景渐变夜景，/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '换一批' }))
    expect(
      within(screen.getByRole('main')).getAllByRole('button', { name: /加入灵感篮/ }),
    ).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /^缓慢推进镜头，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^日景渐变夜景，/ })).toBeVisible()
  })

  it('resets recommendations and exposes one truthful all-navigation state after a media switch', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '为你推荐' }))
    await user.click(screen.getByRole('button', { name: '换一批' }))
    await user.click(screen.getByRole('button', { name: '视频' }))

    expect(screen.getByRole('button', { name: '浏览全部灵感' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '为你推荐' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('正在展示 8 个精选词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '为你推荐' }))
    expect(screen.getByRole('button', { name: /^缓慢推进镜头，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^日景渐变夜景，/ })).not.toBeInTheDocument()
  })

  it('clears undo history when switching media libraries', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '视频' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '撤销上一步灵感篮操作' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.queryByText('年轻女性')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^缓慢推进镜头，/ }))
    await user.click(screen.getByRole('button', { name: '图片' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '撤销上一步灵感篮操作' })).toBeDisabled()
    expect(screen.queryByText('缓慢推进镜头')).not.toBeInTheDocument()
  })

  it('combines every criterion and clears all filters from the empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    await user.click(screen.getByRole('button', { name: '场景环境' }))
    await user.click(screen.getByRole('button', { name: '电影感' }))
    await user.click(screen.getByRole('button', { name: '内置精选' }))
    await user.type(search, '雨')

    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toBeVisible()
    expect(screen.getByText('找到 1 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '我的词条' }))
    await user.click(screen.getByRole('button', { name: '清除全部筛选' }))

    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: '浏览全部灵感' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '我的词条' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('正在展示 3159 个精选词条')).toBeVisible()
  })

  it('keeps all top-level library navigation states mutually exclusive', async () => {
    const user = userEvent.setup()
    render(<App />)
    const navigation = within(screen.getByRole('navigation', { name: '提示词分类' }))
    const topLevelNames = [
      '浏览全部灵感',
      '为你推荐',
      '我的收藏，0 个',
      '最近使用，0 条',
      '模板组合',
    ]
    const expectOnlyPressed = (name: string) => {
      for (const candidate of topLevelNames) {
        expect(navigation.getByRole('button', { name: candidate })).toHaveAttribute(
          'aria-pressed',
          candidate === name ? 'true' : 'false',
        )
      }
    }

    expectOnlyPressed('浏览全部灵感')
    for (const name of topLevelNames.slice(1)) {
      await user.click(navigation.getByRole('button', { name }))
      expectOnlyPressed(name)
    }
  })

  it('switches search from recent, templates, and recommendations to all', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    for (const view of ['最近使用，0 条', '模板组合', '为你推荐']) {
      await user.click(screen.getByRole('button', { name: view }))
      await user.type(search, '女性')
      expect(screen.getByRole('heading', { name: '灵感词库' })).toBeVisible()
      expect(screen.getByRole('button', { name: '浏览全部灵感' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      await user.clear(search)
    }
  })

  it('uses a visible media template in declared order and keeps unrelated state unchanged', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: 'EN' }))
    fireEvent.change(screen.getByRole('textbox', { name: '编辑拼装结果' }), {
      target: { value: 'manual before template' },
    })
    await user.click(screen.getByRole('button', { name: '模板组合' }))

    expect(screen.getByRole('heading', { name: '电影感人像' })).toBeVisible()
    expect(screen.getByText('年轻女性', { selector: 'li' })).toBeVisible()
    expect(screen.getByText('柔和侧逆光', { selector: 'li' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '使用模板 电影感人像' }))

    expect(
      screen.getAllByRole('button', { name: /从灵感篮移除/ }).map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining('年轻女性'),
      expect.stringContaining('柔和侧逆光'),
      expect.stringContaining('中近景'),
      expect.stringContaining('克制的电影感'),
    ])
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      'young woman, soft rim lighting, medium close-up, restrained cinematic style.',
    )
    expect(screen.getByRole('button', { name: '我的收藏，1 个' })).toBeVisible()
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(
      'neon-lit rainy street.',
    )
  })

  it('shows only the real presets declared for the active media type', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '模板组合' }))
    expect(screen.getAllByRole('button', { name: /^使用模板/ })).toHaveLength(8)
    expect(screen.getByRole('heading', { name: '东方庭院' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '角色入场' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '视频' }))
    await user.click(screen.getByRole('button', { name: '模板组合' }))
    expect(screen.getAllByRole('button', { name: /^使用模板/ })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: '角色入场' })).toBeVisible()
    expect(screen.getByText('缓慢推进镜头', { selector: 'li' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '东方庭院' })).not.toBeInTheDocument()
  })

  it('restores an exact recent composition without the synchronization effect overwriting it', async () => {
    const exactText = '  exact manual\n保留文本  '
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'restored-image',
            mediaType: 'image',
            promptIds: ['neon-rain', 'young-woman'],
            language: 'en',
            copiedText: exactText,
            usedAt: 100,
          },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性' }))
    await user.click(screen.getByRole('button', { name: '最近使用，1 条' }))
    await user.click(screen.getByRole('button', { name: /再次使用.*exact manual 保留文本/ }))

    expect(
      screen.getAllByRole('button', { name: /从灵感篮移除/ }).map((button) => button.textContent),
    ).toEqual([expect.stringContaining('霓虹雨夜街道'), expect.stringContaining('年轻女性')])
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue(exactText)
    expect(screen.getByRole('button', { name: 'EN' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: '我的收藏，1 个' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('young woman.')
  })

  it('avoids generated recent IDs that collide with persisted records after remount', async () => {
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'image-1000-0',
            mediaType: 'image',
            promptIds: ['young-woman'],
            language: 'zh',
            copiedText: 'older text',
            usedAt: 999,
          },
        ],
      }),
    )
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    const firstRender = render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    firstRender.unmount()
    render(<App />)

    expect(screen.getByRole('button', { name: '最近使用，2 条' })).toBeVisible()
  })

  it('keeps successful recent usage across remounts and isolates it by media type', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    const firstRender = render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    firstRender.unmount()
    render(<App />)

    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '图片' }))
    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
  })

  it('starts safely and keeps successful recent usage in memory when the localStorage getter throws', async () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)

    try {
      expect(() => render(<App />)).not.toThrow()
      await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
      await user.click(screen.getByRole('button', { name: '复制提示词' }))

      expect(screen.getByRole('status')).toHaveTextContent('已复制到剪贴板')
      expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor)
      }
    }
  })

  it('keeps the in-memory recent view usable when localStorage writes fail', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    await user.click(screen.getByRole('button', { name: '复制提示词' }))

    expect(screen.getByRole('status')).toHaveTextContent('已复制到剪贴板')
    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '最近使用，1 条' }))
    expect(screen.getByText('年轻女性。', { selector: 'pre' })).toBeVisible()
  })

  it('applies exact app-level recent dedupe, newest ordering, and the twelve-record cap', async () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      id: `seed-${index}`,
      mediaType: 'image',
      promptIds: ['young-woman'],
      language: 'zh',
      copiedText: `text-${index}`,
      usedAt: 100 - index,
    }))
    localStorage.setItem(RECENT_USAGE_STORAGE_KEY, JSON.stringify({ version: 1, records }))
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '编辑拼装结果' }), {
      target: { value: 'brand-new' },
    })
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    expect(screen.getByRole('button', { name: '最近使用，12 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '最近使用，12 条' }))
    expect(Array.from(document.querySelectorAll('pre'), (node) => node.textContent)[0]).toBe(
      'brand-new',
    )
    expect(screen.queryByText('text-11', { selector: 'pre' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: '编辑拼装结果' }), {
      target: { value: 'text-5' },
    })
    await user.click(screen.getByRole('button', { name: '复制提示词' }))
    const copiedTexts = Array.from(document.querySelectorAll('pre'), (node) => node.textContent)
    expect(copiedTexts).toHaveLength(12)
    expect(copiedTexts[0]).toBe('text-5')
    expect(copiedTexts.filter((text) => text === 'text-5')).toHaveLength(1)
  })

  it('records exact edited output only after a successful copy', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const user = userEvent.setup()
    mockClipboard(writeText)
    render(<App />)

    expect(screen.getByRole('button', { name: '最近使用，0 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^年轻女性，/ }))
    const editor = screen.getByRole('textbox', { name: '编辑拼装结果' })
    fireEvent.change(editor, { target: { value: '  精确保留\nmanual text  ' } })
    await user.click(screen.getByRole('button', { name: '复制提示词' }))

    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '最近使用，1 条' }))
    const exactText = '  精确保留\nmanual text  '
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'PRE' && element.textContent === exactText,
      ),
    ).toBeVisible()
    expect(screen.getAllByText('年轻女性')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /再次使用.*精确保留 manual text/ })).toBeVisible()
  })
})
