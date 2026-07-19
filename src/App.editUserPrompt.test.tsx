import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const seededPrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'user-seeded-portrait',
  zh: '种子肖像',
  en: 'Seeded Portrait',
  description_zh: '原始中文描述',
  description_en: 'original English description',
  category_id: 'people-subjects',
  tags: ['人像', '柔光'],
  aliases_zh: ['种子别名'],
  aliases_en: ['seed alias'],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

function seed(prompts: PromptConcept[] = [seededPrompt]) {
  localStorage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 1, prompts }))
}

beforeEach(() => {
  localStorage.clear()
  seed()
})

describe('edit user prompt', () => {
  it('offers an independent edit control only for user cards', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: '编辑 种子肖像' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^编辑 年轻女性$/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))

    expect(screen.getByRole('dialog', { name: '编辑词条' })).toBeVisible()
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '收藏 种子肖像' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(document.querySelector('button button')).toBeNull()
  })

  it('focuses edit mode and restores its opener when Escape closes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: '编辑 种子肖像' })

    await user.click(opener)

    expect(screen.getByRole('textbox', { name: '中文名称' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '编辑词条' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('prefills the shared form and cancel leaves storage and state unchanged', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    const dialog = screen.getByRole('dialog', { name: '编辑词条' })

    expect(within(dialog).getByRole('textbox', { name: '中文名称' })).toHaveValue('种子肖像')
    expect(within(dialog).getByRole('textbox', { name: '英文名称' })).toHaveValue('Seeded Portrait')
    expect(within(dialog).getByRole('textbox', { name: '中文描述（可选）' })).toHaveValue(
      '原始中文描述',
    )
    expect(within(dialog).getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue(
      'original English description',
    )
    expect(within(dialog).getByRole('combobox', { name: '分类' })).toHaveValue('people-subjects')
    expect(within(dialog).getByRole('textbox', { name: '标签（可选）' })).toHaveValue('人像, 柔光')
    expect(within(dialog).getByRole('textbox', { name: '中文别名（可选）' })).toHaveValue(
      '种子别名',
    )
    expect(within(dialog).getByRole('textbox', { name: '英文别名（可选）' })).toHaveValue(
      'seed alias',
    )
    expect(dialog).toHaveTextContent('当前媒体：图片')
    expect(within(dialog).getByRole('button', { name: '保存修改' })).toBeVisible()

    await user.clear(within(dialog).getByRole('textbox', { name: '中文名称' }))
    await user.type(within(dialog).getByRole('textbox', { name: '中文名称' }), '不应保存')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
    expect(screen.getByRole('button', { name: /^种子肖像，Seeded Portrait，/ })).toBeVisible()
  })

  it('saves every edited field with stable identity and updates live derived state', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^种子肖像，Seeded Portrait，/ }))
    await user.click(screen.getByRole('button', { name: '收藏 种子肖像' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('种子肖像。')

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    const dialog = screen.getByRole('dialog', { name: '编辑词条' })
    const replace = async (name: string, value: string) => {
      const field = within(dialog).getByRole('textbox', { name })
      await user.clear(field)
      await user.type(field, value)
    }
    await replace('中文名称', '  更新肖像  ')
    await replace('英文名称', '  Updated Portrait  ')
    await replace('中文描述（可选）', '  更新中文描述  ')
    await replace('英文描述（可选）', '  updated English description  ')
    await replace('标签（可选）', ' 新标签， 新标签, 第二标签 ')
    await replace('中文别名（可选）', ' 新中文别名, 新中文别名 ')
    await replace('英文别名（可选）', ' new alias, second alias ')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '分类' }), 'visual-style')
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('词条修改已保存到本机。')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /^更新肖像，Updated Portrait，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '取消收藏 更新肖像' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('更新肖像。')
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('Updated Portrait.')

    const stored = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!).prompts[0]
    expect(stored).toEqual({
      ...seededPrompt,
      zh: '更新肖像',
      en: 'Updated Portrait',
      description_zh: '更新中文描述',
      description_en: 'updated English description',
      category_id: 'visual-style',
      tags: ['新标签', '第二标签'],
      aliases_zh: ['新中文别名'],
      aliases_en: ['new alias', 'second alias'],
    })

    const search = screen.getByRole('searchbox', { name: '搜索提示词' })
    await user.type(search, 'new alias')
    expect(screen.getByRole('button', { name: /^更新肖像，Updated Portrait，/ })).toBeVisible()
    await user.clear(search)
    await user.type(search, '种子别名')
    expect(screen.queryByRole('button', { name: /^更新肖像，/ })).not.toBeInTheDocument()
  }, 30_000)

  it('clears both optional descriptions while preserving stable prompt fields', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    const dialog = screen.getByRole('dialog', { name: '编辑词条' })
    await user.clear(within(dialog).getByRole('textbox', { name: '中文描述（可选）' }))
    await user.clear(within(dialog).getByRole('textbox', { name: '英文描述（可选）' }))
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!).prompts[0]).toEqual({
      ...seededPrompt,
      description_zh: '',
      description_en: '',
    })
  })

  it('rejects required and other-record duplicates while excluding the edited record itself', async () => {
    const other = { ...seededPrompt, id: 'user-other', zh: '其他词条', en: 'Other Prompt' }
    seed([seededPrompt, other])
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    let dialog = screen.getByRole('dialog', { name: '编辑词条' })
    const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
    await user.clear(zh)
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请填写中文名称、英文名称和分类。')

    await user.type(zh, seededPrompt.zh)
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    dialog = screen.getByRole('dialog', { name: '编辑词条' })
    const en = within(dialog).getByRole('textbox', { name: '英文名称' })
    await user.clear(en)
    await user.type(en, '  OTHER PROMPT  ')
    await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('中文或英文名称已存在')
    expect(dialog).toBeVisible()
  })

  it('restores a durable edit after remount', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    const name = screen.getByRole('textbox', { name: '中文名称' })
    await user.clear(name)
    await user.type(name, '重启后的编辑')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    view.unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: /^重启后的编辑，Seeded Portrait，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^种子肖像，/ })).not.toBeInTheDocument()
  })

  it.each(['getter', 'write'] as const)(
    'keeps a %s-failed edit in memory with exact session-only feedback',
    async (failure) => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
      const name = screen.getByRole('textbox', { name: '中文名称' })
      await user.clear(name)
      await user.type(name, `会话编辑-${failure}`)
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
      const write =
        failure === 'write'
          ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
              throw new DOMException('quota', 'QuotaExceededError')
            })
          : undefined
      try {
        if (failure === 'getter') {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('blocked', 'SecurityError')
            },
          })
        }
        await user.click(screen.getByRole('button', { name: '保存修改' }))
      } finally {
        write?.mockRestore()
        if (failure === 'getter') {
          if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
          else Reflect.deleteProperty(window, 'localStorage')
        }
      }

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: new RegExp(`^会话编辑-${failure}，`) }),
      ).toBeVisible()
      expect(screen.getByText('词条修改已应用到当前会话，但无法保存到本机。')).toHaveAttribute(
        'role',
        'status',
      )
    },
  )

  it('does not overwrite a manually edited composition when prompt metadata changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^种子肖像，Seeded Portrait，/ }))
    const output = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(output)
    await user.type(output, '我的手动组合')

    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    const name = screen.getByRole('textbox', { name: '中文名称' })
    await user.clear(name)
    await user.type(name, '元数据更新')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('我的手动组合')
  })

  it('closes and resets edit mode when media changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '编辑 种子肖像' }))
    await user.clear(screen.getByRole('textbox', { name: '中文名称' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '不应跨媒体')

    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.queryByRole('dialog', { name: '编辑词条' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '图片' }))
    expect(screen.getByRole('button', { name: /^种子肖像，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^不应跨媒体，/ })).not.toBeInTheDocument()
  })
})
