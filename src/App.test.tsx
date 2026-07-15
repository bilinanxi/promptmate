import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'

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
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('PromptMate workspace', () => {
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
    expect(screen.getByText('找到 2 个词条')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '浏览全部灵感' }))

    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
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
    unmount()

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    await act(async () => resolveCopy())

    expect(setTimeoutSpy).not.toHaveBeenCalled()
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
    expect(within(screen.getByRole('main')).getAllByText('内置精选')).toHaveLength(12)
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
    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
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
    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
  })

  it('filters the library by category and restores all recommendations', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '场景环境' }))

    expect(screen.getByRole('button', { name: /^霓虹雨夜街道，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^静谧中式庭院，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^年轻女性，/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '场景环境' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('找到 2 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '为你推荐' }))

    expect(screen.getByRole('button', { name: /^年轻女性，/ })).toBeVisible()
    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
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
    expect(screen.getByText('没有找到匹配的词条')).toBeVisible()
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
    expect(screen.getByRole('button', { name: '为你推荐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '视频' })).toHaveAttribute('aria-pressed', 'true')
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
    expect(screen.getByRole('button', { name: '为你推荐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '我的词条' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
  })
})
