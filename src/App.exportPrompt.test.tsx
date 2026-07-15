import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { browserDownload } from './features/prompt-library/browserDownload'
import { PROMPT_CSV_HEADER } from './features/prompt-library/promptCsv'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

vi.mock('./features/prompt-library/browserDownload', () => ({ browserDownload: vi.fn() }))

const mine: PromptConcept = {
  schema_version: '1.0',
  id: 'mine-image',
  zh: '我的图片词条',
  en: 'my image prompt',
  description_zh: '我的描述',
  description_en: 'My description',
  category_id: 'people-subjects',
  tags: [],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

const shared: PromptConcept = {
  ...mine,
  id: 'shared-video',
  zh: '社区视频词条',
  en: 'shared video prompt',
  category_id: 'camera-movement',
  media_types: ['video'],
  source: 'imported',
}

beforeEach(() => {
  vi.mocked(browserDownload).mockReset()
  localStorage.clear()
  localStorage.setItem(
    USER_PROMPTS_STORAGE_KEY,
    JSON.stringify({ version: 2, prompts: [shared, mine] }),
  )
})

describe('prompt export UI', () => {
  it('exports the exact selected deterministic package once without storage or catalog mutation', async () => {
    const user = userEvent.setup()
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)
    const catalogBefore = screen.getAllByRole('button', { name: /加入灵感篮/ }).length

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.click(within(dialog).getByRole('tab', { name: '导出' }))
    await user.selectOptions(within(dialog).getByLabelText('媒体范围'), 'all')
    await user.selectOptions(within(dialog).getByLabelText('词条来源'), 'user')
    await user.selectOptions(within(dialog).getByLabelText('导出格式'), 'package')

    expect(within(dialog).getByText('将导出 1 条词条')).toBeVisible()
    storageWrite.mockClear()
    await user.click(within(dialog).getByRole('button', { name: '下载 1 条词条' }))

    expect(browserDownload).toHaveBeenCalledOnce()
    expect(browserDownload).toHaveBeenCalledWith({
      content: expect.stringContaining('"format": "promptmate.prompt-package",\n'),
      fileName: 'promptmate-all-user.promptmate.json',
      mimeType: 'application/json;charset=utf-8',
    })
    const request = vi.mocked(browserDownload).mock.calls[0][0]
    expect(request.content).toContain('"id": "mine-image"')
    expect(request.content).not.toContain('shared-video')
    expect(storageWrite).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /加入灵感篮/ })).toHaveLength(catalogBefore)
  })

  it('downloads deterministic CSV once with its exact adapter metadata and no storage write', async () => {
    const user = userEvent.setup()
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.click(within(dialog).getByRole('tab', { name: '导出' }))
    await user.selectOptions(within(dialog).getByLabelText('词条来源'), 'user')
    await user.selectOptions(within(dialog).getByLabelText('导出格式'), 'csv')
    storageWrite.mockClear()
    await user.click(within(dialog).getByRole('button', { name: '下载 1 条词条' }))

    expect(browserDownload).toHaveBeenCalledOnce()
    expect(browserDownload).toHaveBeenCalledWith({
      content: expect.stringMatching(
        new RegExp(`^${PROMPT_CSV_HEADER.join(',')}\\r\\n1\\.0,mine-image,`),
      ),
      fileName: 'promptmate-image-user.csv',
      mimeType: 'text/csv;charset=utf-8',
    })
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('shows a truthful empty state and disables download when the scope has no rows', async () => {
    localStorage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 2, prompts: [mine] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '导入与导出' }))
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.click(within(dialog).getByRole('tab', { name: '导出' }))
    await user.selectOptions(within(dialog).getByLabelText('词条来源'), 'imported')

    expect(within(dialog).getByText('当前范围没有可导出的词条。')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '下载 0 条词条' })).toBeDisabled()
    expect(browserDownload).not.toHaveBeenCalled()
  })
})
