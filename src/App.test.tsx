import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('PromptMate workspace', () => {
  it('presents the prompt library as the primary workspace', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '灵感词库' })).toBeVisible()
    expect(screen.getByRole('button', { name: /年轻女性/ })).toBeVisible()
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
})
