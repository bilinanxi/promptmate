import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const importedPrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'community-delete-me',
  zh: '待删社区词条',
  en: 'Imported Delete Target',
  description_zh: '待删除',
  description_en: 'delete me',
  category_id: 'people-subjects',
  tags: [],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'imported',
  status: 'approved',
}

function seed() {
  localStorage.setItem(
    USER_PROMPTS_STORAGE_KEY,
    JSON.stringify({ version: 2, prompts: [importedPrompt] }),
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  seed()
})

describe('delete imported prompt', () => {
  it('cleans dependent state and remains deleted after remount', async () => {
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        favorites: [{ mediaType: 'image', promptId: importedPrompt.id }],
      }),
    )
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'recent-imported',
            mediaType: 'image',
            promptIds: [importedPrompt.id],
            language: 'zh',
            copiedText: importedPrompt.zh,
            usedAt: Date.now(),
          },
        ],
      }),
    )
    const user = userEvent.setup()
    const view = render(<App />)
    await user.click(screen.getByRole('button', { name: /^待删社区词条，/ }))

    await user.click(screen.getByRole('button', { name: '删除 待删社区词条' }))
    await user.click(screen.getByRole('button', { name: '确认删除 待删社区词条' }))

    expect(screen.getByText('社区词条已删除。')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('button', { name: /^待删社区词条，/ })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [],
    })
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual({
      version: 1,
      favorites: [],
    })
    expect(JSON.parse(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)!)).toEqual({
      version: 1,
      records: [],
    })
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    await user.click(screen.getByRole('button', { name: '撤销上一步灵感篮操作' }))
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')

    view.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '社区导入' }))
    expect(screen.queryByRole('button', { name: /^待删社区词条，/ })).not.toBeInTheDocument()
  })

  it('deletes in memory with an explicit community session warning when persistence fails', async () => {
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === USER_PROMPTS_STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)
    const user = userEvent.setup()
    render(<App />)

    try {
      await user.click(screen.getByRole('button', { name: '删除 待删社区词条' }))
      await user.click(screen.getByRole('button', { name: '确认删除 待删社区词条' }))
    } finally {
      write.mockRestore()
    }

    expect(
      screen.getByText('社区词条已从当前会话删除，但部分本地数据可能未保存。'),
    ).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('button', { name: /^待删社区词条，/ })).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
  })
})
