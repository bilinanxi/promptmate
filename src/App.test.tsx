import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('PromptMate workspace', () => {
  it('presents the prompt library as the primary workspace', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '灵感词库' })).toBeVisible()
    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
    expect(screen.getByText('适合人像、时尚和叙事画面的通用主体。')).toBeVisible()
    expect(within(screen.getByRole('main')).getAllByText('内置精选')).toHaveLength(12)
    expect(screen.getByText('灵感篮')).toBeVisible()
  })

  it('adds a prompt card to the basket and composes the Chinese prompt', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /年轻女性/ }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('1')
    expect(screen.getByLabelText('自动拼装结果')).toHaveTextContent('年轻女性。')
  })

  it('switches the composed prompt to English', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /年轻女性/ }))
    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByLabelText('自动拼装结果')).toHaveTextContent('young woman.')
  })

  it('combines multiple selected cards in library order', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /年轻女性/ }))
    await user.click(screen.getByRole('button', { name: /霓虹雨夜街道/ }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('2')
    expect(screen.getByLabelText('自动拼装结果')).toHaveTextContent('年轻女性，霓虹雨夜街道。')
  })

  it('searches names, descriptions, aliases, tags, categories, and media types', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    await user.type(search, '现代水墨')

    expect(screen.getByRole('button', { name: /当代水墨气质/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /年轻女性/ })).not.toBeInTheDocument()
    expect(screen.getByText('找到 1 个词条')).toBeVisible()
  })

  it('shows an empty result and restores the library after clearing search', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '不存在的词条')

    expect(screen.getByText('没有找到匹配的词条')).toBeVisible()
    expect(screen.getByText('找到 0 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '清除搜索' }))

    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
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

    expect(screen.getByRole('button', { name: /霓虹雨夜街道/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /静谧中式庭院/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /年轻女性/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '场景环境' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('找到 2 个词条')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '为你推荐' }))

    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
    expect(screen.getByText('正在展示 12 个精选词条')).toBeVisible()
  })

  it('filters the library by tag and clears the tag with All', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '电影感' }))

    expect(screen.getByRole('button', { name: /霓虹雨夜街道/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /克制的电影感/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /年轻女性/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '电影感' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '全部' }))

    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
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
    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
  })

  it('combines every criterion and clears all filters from the empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    const search = screen.getByRole('searchbox', { name: '搜索提示词' })

    await user.click(screen.getByRole('button', { name: '场景环境' }))
    await user.click(screen.getByRole('button', { name: '电影感' }))
    await user.click(screen.getByRole('button', { name: '内置精选' }))
    await user.type(search, '雨')

    expect(screen.getByRole('button', { name: /霓虹雨夜街道/ })).toBeVisible()
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
