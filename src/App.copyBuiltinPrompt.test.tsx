import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { builtinPromptsByMedia } from './features/prompt-library/builtinPrompts'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'
import type { PromptConcept } from './features/prompt-library/types'

const seededUserPrompt: PromptConcept = {
  schema_version: '1.0',
  id: 'user-seeded-portrait',
  zh: '种子肖像',
  en: 'Seeded Portrait',
  description_zh: '原始中文描述',
  description_en: 'original English description',
  category_id: 'people-subjects',
  tags: ['人像'],
  aliases_zh: ['种子别名'],
  aliases_en: ['seed alias'],
  media_types: ['image'],
  source: 'user',
  status: 'approved',
}

function seed(prompts: PromptConcept[] = [seededUserPrompt]) {
  localStorage.setItem(USER_PROMPTS_STORAGE_KEY, JSON.stringify({ version: 1, prompts }))
}

beforeEach(() => {
  localStorage.clear()
  seed()
})

describe('copy builtin prompt then edit', () => {
  it('offers an independent copy control only for builtins and opens the shared prefilled form', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: '复制并编辑 年轻女性' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '复制并编辑 种子肖像' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))

    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    expect(within(dialog).getByRole('textbox', { name: '中文名称' })).toHaveValue('年轻女性')
    expect(within(dialog).getByRole('textbox', { name: '英文名称' })).toHaveValue('young woman')
    expect(within(dialog).getByRole('textbox', { name: '中文描述（可选）' })).toHaveValue(
      '适合人像、时尚和叙事画面的通用主体。',
    )
    expect(within(dialog).getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue(
      'A versatile subject for portraits, fashion, and narrative scenes.',
    )
    expect(within(dialog).getByRole('combobox', { name: '分类' })).toHaveValue('people-subjects')
    expect(within(dialog).getByRole('textbox', { name: '标签（可选）' })).toHaveValue(
      '人像, 新手友好',
    )
    expect(within(dialog).getByRole('textbox', { name: '中文别名（可选）' })).toHaveValue(
      '年轻女子',
    )
    expect(within(dialog).getByRole('textbox', { name: '英文别名（可选）' })).toHaveValue(
      'young female',
    )
    expect(dialog).toHaveTextContent('当前媒体：图片')
    expect(within(dialog).getByRole('button', { name: '保存到我的词条' })).toBeVisible()
    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '收藏 年轻女性' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(document.querySelector('button button')).toBeNull()
  })

  it('focuses copy mode and restores its opener when Escape closes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: '复制并编辑 年轻女性' })

    await user.click(opener)

    expect(screen.getByRole('textbox', { name: '中文名称' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '复制并编辑词条' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('cancels copy mode without changing storage or the origin', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = localStorage.getItem(USER_PROMPTS_STORAGE_KEY)

    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    const name = screen.getByRole('textbox', { name: '中文名称' })
    await user.clear(name)
    await user.type(name, '不应保存')
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBe(before)
    expect(screen.getByRole('button', { name: /^年轻女性，young woman，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^不应保存，/ })).not.toBeInTheDocument()
  })

  it('saves a copy after clearing every optional field', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    const replace = async (name: string, value: string) => {
      const field = within(dialog).getByRole('textbox', { name })
      await user.clear(field)
      if (value) await user.type(field, value)
    }

    await replace('中文名称', '最小副本')
    await replace('英文名称', 'Minimal Copy')
    for (const name of [
      '中文描述（可选）',
      '英文描述（可选）',
      '标签（可选）',
      '中文别名（可选）',
      '英文别名（可选）',
    ]) {
      await replace(name, '')
    }
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))

    const stored = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!).prompts.at(-1)
    expect(stored).toMatchObject({
      zh: '最小副本',
      en: 'Minimal Copy',
      description_zh: '',
      description_en: '',
      tags: [],
      aliases_zh: [],
      aliases_en: [],
      media_types: ['image'],
      source: 'user',
      status: 'approved',
    })
  }, 15_000)

  it('rejects unchanged builtin names, then creates a parsed manageable user copy without changing its origin', async () => {
    const user = userEvent.setup()
    const originBefore = structuredClone(builtinPromptsByMedia.image[0])
    render(<App />)

    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('中文或英文名称已存在')
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toContain('user-seeded-portrait')

    const replace = async (name: string, value: string) => {
      const field = within(dialog).getByRole('textbox', { name })
      await user.clear(field)
      await user.type(field, value)
    }
    await replace('中文名称', '  年轻女性副本  ')
    await replace('英文名称', '  Young Woman Copy  ')
    await replace('中文描述（可选）', '  自定义中文描述  ')
    await replace('英文描述（可选）', '  custom English description  ')
    await replace('标签（可选）', ' 人像，副本, 人像 ')
    await replace('中文别名（可选）', ' 副本别名, 副本别名，另一个别名 ')
    await replace('英文别名（可选）', ' copy alias, second alias ')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '分类' }), 'visual-style')
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建词条' })).toHaveFocus()
    expect(screen.getByText('词条副本已保存到我的词条。')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /^年轻女性副本，Young Woman Copy，/ })).toBeVisible()
    expect(screen.getByRole('button', { name: '我的词条' })).toHaveAttribute('aria-pressed', 'true')

    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [
        seededUserPrompt,
        {
          schema_version: '1.0',
          id: 'user-young-woman-copy',
          zh: '年轻女性副本',
          en: 'Young Woman Copy',
          description_zh: '自定义中文描述',
          description_en: 'custom English description',
          category_id: 'visual-style',
          tags: ['人像', '副本'],
          aliases_zh: ['副本别名', '另一个别名'],
          aliases_en: ['copy alias', 'second alias'],
          media_types: ['image'],
          source: 'user',
          status: 'approved',
        },
      ],
    })
    expect(builtinPromptsByMedia.image[0]).toEqual(originBefore)

    const copyCard = screen.getByRole('button', { name: /^年轻女性副本，Young Woman Copy，/ })
    await user.click(copyCard)
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('年轻女性副本。')
    await user.click(screen.getByRole('button', { name: '收藏 年轻女性副本' }))
    expect(screen.getByRole('button', { name: '取消收藏 年轻女性副本' })).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑 年轻女性副本' })).toBeVisible()
    expect(screen.getByRole('button', { name: '删除 年轻女性副本' })).toBeVisible()
  }, 15_000)

  it('probes globally occupied IDs across media and survives a durable remount', async () => {
    const occupiedImage: PromptConcept = {
      ...seededUserPrompt,
      id: 'user-young-woman-copy',
      zh: '已占用图片编号',
      en: 'Occupied Image ID',
    }
    const occupiedVideo: PromptConcept = {
      ...seededUserPrompt,
      id: 'user-young-woman-copy-2',
      zh: '已占用视频编号',
      en: 'Occupied Video ID',
      category_id: 'camera-movement',
      media_types: ['video'],
    }
    seed([seededUserPrompt, occupiedImage, occupiedVideo])
    const user = userEvent.setup()
    const view = render(<App />)
    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
    const en = within(dialog).getByRole('textbox', { name: '英文名称' })
    await user.clear(zh)
    await user.type(zh, '耐久年轻女性副本')
    await user.clear(en)
    await user.type(en, 'Young Woman Copy')
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))

    const stored = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!).prompts
    expect(stored.map((prompt: PromptConcept) => prompt.id)).toEqual([
      'user-seeded-portrait',
      'user-young-woman-copy',
      'user-young-woman-copy-2',
      'user-young-woman-copy-3',
    ])
    expect(stored.slice(0, 3)).toEqual([seededUserPrompt, occupiedImage, occupiedVideo])

    view.unmount()
    render(<App />)
    expect(
      screen.getByRole('button', { name: /^耐久年轻女性副本，Young Woman Copy，/ }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(
      screen.getByRole('button', { name: /^已占用视频编号，Occupied Video ID，/ }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /^耐久年轻女性副本，/ })).not.toBeInTheDocument()
  })

  it.each(['getter', 'write'] as const)(
    'keeps a %s-failed copy in memory with exact session-only feedback',
    async (failure) => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
      const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
      const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
      const en = within(dialog).getByRole('textbox', { name: '英文名称' })
      await user.clear(zh)
      await user.type(zh, `会话副本-${failure}`)
      await user.clear(en)
      await user.type(en, `session copy ${failure}`)
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
        await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))
      } finally {
        write?.mockRestore()
        if (failure === 'getter') {
          if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
          else Reflect.deleteProperty(window, 'localStorage')
        }
      }

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: new RegExp(`^会话副本-${failure}，`) }),
      ).toBeVisible()
      expect(screen.getByText('词条副本已添加到当前会话，但无法保存到本机。')).toHaveAttribute(
        'role',
        'status',
      )
    },
  )

  it('closes copy mode on media switch and keeps a copied video prompt isolated', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    await user.clear(screen.getByRole('textbox', { name: '中文名称' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '不应跨媒体')

    await user.click(screen.getByRole('button', { name: '视频' }))
    expect(screen.getByRole('button', { name: '视频' })).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: '复制并编辑词条' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建词条' }))
    expect(screen.getByRole('dialog', { name: '新建词条' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '中文名称' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: '取消' }))

    await user.click(screen.getByRole('button', { name: '复制并编辑 缓慢推进镜头' }))
    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    expect(dialog).toHaveTextContent('当前媒体：视频')
    expect(within(dialog).getByRole('combobox', { name: '分类' })).toHaveValue('camera-movement')
    const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
    const en = within(dialog).getByRole('textbox', { name: '英文名称' })
    await user.clear(zh)
    await user.type(zh, '视频推进副本')
    await user.clear(en)
    await user.type(en, 'Video Push Copy')
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))

    expect(screen.getByRole('button', { name: /^视频推进副本，Video Push Copy，/ })).toBeVisible()
    const storedCopy = JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!).prompts.find(
      (prompt: PromptConcept) => prompt.zh === '视频推进副本',
    )
    expect(storedCopy.media_types).toEqual(['video'])
    await user.click(screen.getByRole('button', { name: '图片' }))
    expect(screen.queryByRole('button', { name: /^视频推进副本，/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^不应跨媒体，/ })).not.toBeInTheDocument()
  }, 10_000)

  it('preserves basket order, favorites, manual output, and recent history while copying', async () => {
    const recentPayload = {
      version: 1,
      records: [
        {
          id: 'copy-preserve-recent',
          mediaType: 'image',
          promptIds: ['young-woman'],
          language: 'zh',
          copiedText: '历史手动内容',
          usedAt: Date.now() - 1000,
        },
      ],
    }
    localStorage.setItem(RECENT_USAGE_STORAGE_KEY, JSON.stringify(recentPayload))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^年轻女性，young woman，/ }))
    await user.click(screen.getByRole('button', { name: /^霓虹雨夜街道，/ }))
    await user.click(screen.getByRole('button', { name: '上移 霓虹雨夜街道' }))
    await user.click(screen.getByRole('button', { name: '收藏 霓虹雨夜街道' }))
    const favoriteBefore = localStorage.getItem(FAVORITES_STORAGE_KEY)
    const output = screen.getByRole('textbox', { name: '编辑拼装结果' })
    await user.clear(output)
    await user.type(output, '保留手动组合')

    await user.click(screen.getByRole('button', { name: '复制并编辑 年轻女性' }))
    const dialog = screen.getByRole('dialog', { name: '复制并编辑词条' })
    const zh = within(dialog).getByRole('textbox', { name: '中文名称' })
    const en = within(dialog).getByRole('textbox', { name: '英文名称' })
    await user.clear(zh)
    await user.type(zh, '状态保留副本')
    await user.clear(en)
    await user.type(en, 'preserved state copy')
    await user.click(within(dialog).getByRole('button', { name: '保存到我的词条' }))

    expect(screen.getByLabelText('已选词条数量')).toHaveTextContent('2')
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('保留手动组合')
    expect(
      screen.getAllByRole('button', { name: /^从灵感篮移除 / }).map((button) => button.textContent),
    ).toEqual(['霓虹雨夜街道×', '年轻女性×'])
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe(favoriteBefore)
    expect(localStorage.getItem(RECENT_USAGE_STORAGE_KEY)).toBe(JSON.stringify(recentPayload))
    expect(screen.getByRole('button', { name: '最近使用，1 条' })).toBeVisible()
  }, 15_000)
})
