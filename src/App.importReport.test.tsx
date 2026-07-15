import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const { download } = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('./features/prompt-library/browserDownload', () => ({ browserDownload: download }))

const existing: PromptConcept = {
  schema_version: '1.0',
  id: 'existing-report-target',
  zh: '已有报告目标',
  en: 'Existing Report Target',
  description_zh: '',
  description_en: '',
  category_id: 'people-subjects',
  tags: [],
  aliases_zh: [],
  aliases_en: [],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

function openDialog(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: '导入与导出' }))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    USER_PROMPTS_STORAGE_KEY,
    JSON.stringify({ version: 2, prompts: [existing] }),
  )
  download.mockReset()
})

describe('import error report UI', () => {
  it('downloads every current parser issue once without mutating storage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDialog(user)
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    expect(within(dialog).queryByRole('button', { name: '下载导入报告' })).not.toBeInTheDocument()
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)

    await user.upload(
      within(dialog).getByLabelText('选择 JSONL 文件'),
      new File(['{bad}\n{}\n{also bad}\n'], '../unsafe/report.jsonl'),
    )

    expect(await within(dialog).findByText(/第 1 行：此行不是有效的 JSON/)).toBeVisible()
    expect(within(dialog).getByText(/第 2 行 · 字段 schema_version：schema_version/)).toBeVisible()
    expect(within(dialog).getByText(/第 3 行：此行不是有效的 JSON/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: '下载导入报告' }))

    expect(download).toHaveBeenCalledTimes(1)
    const call = download.mock.calls[0][0]
    expect(call.fileName).toBe('report.import-report.json')
    expect(call.mimeType).toBe('application/json;charset=utf-8')
    const report = JSON.parse(call.content)
    expect(report.parser_issues).toHaveLength(3)
    expect(report.parser_issues.map((issue: { line: number }) => issue.line)).toEqual([1, 2, 3])
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
  })

  it('reflects policy recomputation in the report without rereading the file', async () => {
    const incoming = {
      ...existing,
      zh: '替换报告候选',
      en: 'Replacement Report Candidate',
      source: 'imported',
    }
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const user = userEvent.setup()
    render(<App />)
    await openDialog(user)
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(
      within(dialog).getByLabelText('选择 JSONL 文件'),
      new File([JSON.stringify(incoming)], 'policy.jsonl'),
    )

    await user.click(await within(dialog).findByRole('button', { name: '下载导入报告' }))
    expect(JSON.parse(download.mock.calls[0][0].content).plan_rows[0].result).toBe('skip')

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '重复项处理' }),
      'replace',
    )
    await user.click(within(dialog).getByRole('button', { name: '下载导入报告' }))

    expect(download).toHaveBeenCalledTimes(2)
    expect(JSON.parse(download.mock.calls[1][0].content).plan_rows[0].result).toBe('replace')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('keeps the preview retryable when the download adapter throws', async () => {
    download.mockImplementation(() => {
      throw new Error('download blocked')
    })
    const user = userEvent.setup()
    render(<App />)
    await openDialog(user)
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    await user.upload(
      within(dialog).getByLabelText('选择 JSONL 文件'),
      new File(['{bad}\n'], 'retry.jsonl'),
    )

    await user.click(await within(dialog).findByRole('button', { name: '下载导入报告' }))

    expect(within(dialog).getByText('导入报告下载失败，请重试。')).toHaveAttribute('role', 'alert')
    expect(within(dialog).getByText(/第 1 行：此行不是有效的 JSON/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '下载导入报告' })).toBeEnabled()
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('bounds visible parser issues to 100 while keeping the remainder in the report', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDialog(user)
    const dialog = screen.getByRole('dialog', { name: '导入与导出' })
    const malformed = Array.from({ length: 101 }, (_, index) => `{bad-${index}}`).join('\n')
    await user.upload(
      within(dialog).getByLabelText('选择 JSONL 文件'),
      new File([malformed], 'many-errors.jsonl'),
    )

    expect(await within(dialog).findByText('其余 1 项请下载报告。')).toBeVisible()
    const issueList = within(dialog).getByRole('list', { name: '文件解析错误' })
    expect(within(issueList).getAllByRole('listitem')).toHaveLength(100)
    await user.click(within(dialog).getByRole('button', { name: '下载导入报告' }))
    expect(JSON.parse(download.mock.calls[0][0].content).parser_issues).toHaveLength(101)
  })
})
