import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { FAVORITES_STORAGE_KEY } from './features/prompt-library/favoriteStorage'
import { RECENT_USAGE_STORAGE_KEY } from './features/prompt-library/recentUsageStorage'
import { USER_PROMPTS_STORAGE_KEY } from './features/prompt-library/userPromptStorage'

beforeEach(() => localStorage.clear())

describe('create user prompt', () => {
  it('creates and durably stores a prompt with only bilingual names and category', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    expect(screen.getByRole('textbox', { name: '中文描述（可选）' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '英文描述（可选）' })).toHaveValue('')
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '极简词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'Minimal Prompt')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    expect(screen.queryByText('请填写所有必填项。')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [
        {
          schema_version: '1.0',
          id: 'user-minimal-prompt',
          zh: '极简词条',
          en: 'Minimal Prompt',
          description_zh: '',
          description_en: '',
          category_id: 'people-subjects',
          tags: [],
          aliases_zh: [],
          aliases_en: [],
          media_types: ['image'],
          source: 'user',
          status: 'approved',
        },
      ],
    })
  })

  it('opens an accessible active-media dialog and cancels without mutation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))

    const dialog = screen.getByRole('dialog', { name: '新建词条' })
    expect(dialog).toBeVisible()
    expect(screen.getByText('图片')).toBeVisible()
    expect(document.querySelector('button button')).toBeNull()

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBeNull()
  })

  it('traps keyboard focus, closes on Escape, restores the opener, and inerts the workspace', async () => {
    const user = userEvent.setup()
    render(<App />)
    const opener = screen.getByRole('button', { name: '新建词条' })
    opener.focus()

    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: '新建词条' })
    const firstField = screen.getByRole('textbox', { name: '中文名称' })
    const close = screen.getByRole('button', { name: '关闭新建词条' })
    const submit = screen.getByRole('button', { name: '创建词条' })
    const workspace = screen.getByTestId('app-content')
    expect(firstField).toHaveFocus()
    expect(workspace).toHaveAttribute('inert')

    close.focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(submit).toHaveFocus()
    submit.focus()
    await user.keyboard('{Tab}')
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
    expect(workspace).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
  })

  it('keeps the dialog open for missing required values and active-media duplicate names', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新建词条' }))

    await user.click(screen.getByRole('button', { name: '创建词条' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请填写中文名称、英文名称和分类。')
    expect(screen.getByRole('dialog')).toBeVisible()

    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '  年轻女性  ')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'new subject')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '新描述')
    await user.type(screen.getByRole('textbox', { name: '英文描述（可选）' }), 'new description')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    expect(screen.getByRole('alert')).toHaveTextContent('中文或英文名称已存在')
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)).toBeNull()
  })

  it('creates a parsed image prompt that is immediately searchable, selectable, and favoritable', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '  柔光肖像  ')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), '  Crème Portrait  ')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '  柔和的原创肖像  ')
    await user.type(
      screen.getByRole('textbox', { name: '英文描述（可选）' }),
      '  original soft portrait  ',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.type(screen.getByRole('textbox', { name: '标签（可选）' }), ' 人像, 柔光， 人像 ,, ')
    await user.type(
      screen.getByRole('textbox', { name: '中文别名（可选）' }),
      ' 柔光别称，柔光别称, 肖像别名 ',
    )
    await user.type(
      screen.getByRole('textbox', { name: '英文别名（可选）' }),
      ' soft alias, crème alias ',
    )
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('词条已保存到本机。')).toHaveAttribute('role', 'status')
    const card = screen.getByRole('button', { name: /^柔光肖像，Crème Portrait，/ })
    expect(card).toBeVisible()
    expect(screen.getAllByText('我的词条')).toHaveLength(2)

    expect(JSON.parse(localStorage.getItem(USER_PROMPTS_STORAGE_KEY)!)).toEqual({
      version: 2,
      prompts: [
        {
          schema_version: '1.0',
          id: 'user-creme-portrait',
          zh: '柔光肖像',
          en: 'Crème Portrait',
          description_zh: '柔和的原创肖像',
          description_en: 'original soft portrait',
          category_id: 'people-subjects',
          tags: ['人像', '柔光'],
          aliases_zh: ['柔光别称', '肖像别名'],
          aliases_en: ['soft alias', 'crème alias'],
          media_types: ['image'],
          source: 'user',
          status: 'approved',
        },
      ],
    })

    await user.click(card)
    expect(screen.getByRole('textbox', { name: '编辑拼装结果' })).toHaveValue('柔光肖像。')
    await user.click(screen.getByRole('button', { name: '收藏 柔光肖像' }))
    expect(screen.getByRole('button', { name: '取消收藏 柔光肖像' })).toBeVisible()
    await user.type(screen.getByRole('searchbox', { name: '搜索提示词' }), '肖像别名')
    expect(card).toBeVisible()
  }, 30_000)

  it('keeps newly created image and video prompts isolated to their media user source', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '隔离图片词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'isolated image prompt')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '只属于图片')
    await user.type(screen.getByRole('textbox', { name: '英文描述（可选）' }), 'image only')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    expect(screen.getByRole('button', { name: /^隔离图片词条，/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '视频' }))
    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '隔离视频词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'isolated video prompt')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '只属于视频')
    await user.type(screen.getByRole('textbox', { name: '英文描述（可选）' }), 'video only')
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'camera-movement')
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    expect(screen.getByRole('button', { name: /^隔离视频词条，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^隔离图片词条，/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '图片' }))
    await user.click(screen.getByRole('button', { name: '我的词条' }))
    expect(screen.getByRole('button', { name: /^隔离图片词条，/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^隔离视频词条，/ })).not.toBeInTheDocument()
  }, 30_000)

  it('restores a valid created user prompt after remount', async () => {
    const user = userEvent.setup()
    const view = render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '重启后词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'remounted prompt')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '重启后仍显示')
    await user.type(
      screen.getByRole('textbox', { name: '英文描述（可选）' }),
      'visible after remount',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    await user.click(screen.getByRole('button', { name: '创建词条' }))

    view.unmount()
    render(<App />)

    expect(screen.getByRole('button', { name: /^重启后词条，/ })).toBeVisible()
  })

  it('starts safely when persisted user prompt storage is malformed', () => {
    localStorage.setItem(USER_PROMPTS_STORAGE_KEY, '{not-json')

    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByRole('button', { name: '新建词条' })).toBeVisible()
  })

  it('starts safely when the window localStorage getter throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    let view: ReturnType<typeof render> | undefined

    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
      expect(() => {
        view = render(<App />)
      }).not.toThrow()
    } finally {
      view?.unmount()
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
      else Reflect.deleteProperty(window, 'localStorage')
    }
  })

  it('keeps a successfully created prompt in memory and reports session-only status when writes fail', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '仅会话词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'session only prompt')
    await user.type(screen.getByRole('textbox', { name: '中文描述（可选）' }), '写入失败后仍可见')
    await user.type(
      screen.getByRole('textbox', { name: '英文描述（可选）' }),
      'visible after write failure',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    try {
      await user.click(screen.getByRole('button', { name: '创建词条' }))
    } finally {
      write.mockRestore()
    }

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^仅会话词条，/ })).toBeVisible()
    expect(screen.getByText('词条已添加到当前会话，但无法保存到本机。')).toHaveAttribute(
      'role',
      'status',
    )
  })

  it('keeps a successfully created prompt in memory when storage acquisition fails', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '受限会话词条')
    await user.type(screen.getByRole('textbox', { name: '英文名称' }), 'restricted session prompt')
    await user.type(
      screen.getByRole('textbox', { name: '中文描述（可选）' }),
      '存储不可访问时仍可见',
    )
    await user.type(
      screen.getByRole('textbox', { name: '英文描述（可选）' }),
      'visible without storage access',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: '分类' }), 'people-subjects')
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
      await user.click(screen.getByRole('button', { name: '创建词条' }))
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
      else Reflect.deleteProperty(window, 'localStorage')
    }

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^受限会话词条，/ })).toBeVisible()
    expect(screen.getByText('词条已添加到当前会话，但无法保存到本机。')).toHaveAttribute(
      'role',
      'status',
    )
  })

  it('loads user prompts before favorites and recent usage that reference them', async () => {
    const userPrompt = {
      schema_version: '1.0',
      id: 'user-startup-order',
      zh: '启动顺序词条',
      en: 'startup order prompt',
      description_zh: '用于验证依赖存储启动顺序',
      description_en: 'verifies dependent storage startup order',
      category_id: 'people-subjects',
      tags: ['人像'],
      aliases_zh: [],
      aliases_en: [],
      media_types: ['image'],
      source: 'user',
      status: 'approved',
    }
    localStorage.setItem(
      USER_PROMPTS_STORAGE_KEY,
      JSON.stringify({ version: 1, prompts: [userPrompt] }),
    )
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        favorites: [{ mediaType: 'image', promptId: userPrompt.id }],
      }),
    )
    localStorage.setItem(
      RECENT_USAGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'startup-order-recent',
            mediaType: 'image',
            promptIds: [userPrompt.id],
            language: 'zh',
            copiedText: '启动顺序词条。',
            usedAt: Date.now() - 60_000,
          },
        ],
      }),
    )
    const first = render(<App />)
    first.unmount()
    render(<App />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '我的收藏，1 个' }))
    expect(screen.getByRole('button', { name: /^启动顺序词条，/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '最近使用，1 条' }))
    expect(screen.getByText('启动顺序词条。')).toBeVisible()
    expect(screen.getByRole('button', { name: '再次使用 启动顺序词条。' })).toBeVisible()
  })

  it('closes and resets an open create dialog when the media type changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    await user.type(screen.getByRole('textbox', { name: '中文名称' }), '未完成图片词条')
    await user.click(screen.getByRole('button', { name: '视频' }))

    expect(screen.queryByRole('dialog', { name: '新建词条' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建词条' }))
    expect(screen.getByRole('dialog', { name: '新建词条' })).toHaveTextContent('当前媒体：视频')
    expect(screen.getByRole('textbox', { name: '中文名称' })).toHaveValue('')
  })
})
