import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const importedPrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'community-stable-id',
  zh: '社区肖像',
  en: 'Community Portrait',
  description_zh: '导入描述',
  description_en: 'Imported description',
  category_id: 'people-subjects',
  tags: ['社区'],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'imported',
  status: 'approved',
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    USER_PROMPTS_STORAGE_KEY,
    JSON.stringify({ version: 2, prompts: [importedPrompt] }),
  )
})

describe('edit imported prompt', () => {
  it('edits a community card while preserving its managed identity and source', async () => {
    const user = userEvent.setup()
    const view = render(<App />)

    await user.click(screen.getByRole('button', { name: '编辑 社区肖像' }))
    const dialog = screen.getByRole('dialog', { name: '编辑词条' })
    const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
    await user.clear(zh)
    await user.type(zh, '社区肖像更新')
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))

    expect(screen.getByText('社区词条已更新。')).toHaveAttribute('role', 'status')
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [{ ...importedPrompt, zh: '社区肖像更新' }],
    })

    view.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '社区导入' }))
    expect(
      screen.getByRole('button', { name: /^社区肖像更新，Community Portrait，/ }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑 社区肖像更新' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '编辑 年轻女性' })).not.toBeInTheDocument()
  })
})
