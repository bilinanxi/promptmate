import { useEffect, useMemo, useRef, useState } from 'react'
import { builtinPromptsByMedia } from './features/prompt-library/builtinPrompts'
import { filterPrompts } from './features/prompt-library/filterPrompts'
import type { MediaType, PromptConcept, PromptSource } from './features/prompt-library/types'
import './styles.css'

const sourceLabels: Record<PromptSource, string> = {
  builtin: '内置精选',
  user: '我的词条',
  imported: '社区导入',
  ai_generated: 'AI 生成',
}

const libraryNavigation: Record<
  MediaType,
  { categories: { id?: string; label: string }[]; tags: string[] }
> = {
  image: {
    categories: [
      { label: '为你推荐' },
      { id: 'people-subjects', label: '人物主体' },
      { id: 'scene-environment', label: '场景环境' },
      { id: 'action-pose', label: '动作姿态' },
      { id: 'clothing-accessories', label: '服装配饰' },
      { id: 'lighting-atmosphere', label: '灯光氛围' },
      { id: 'camera-composition', label: '镜头构图' },
      { id: 'visual-style', label: '艺术风格' },
    ],
    tags: ['新手友好', '人像', '电影感', '东方美学', '自然', '商业'],
  },
  video: {
    categories: [
      { label: '为你推荐' },
      { id: 'camera-movement', label: '镜头运动' },
      { id: 'subject-motion', label: '主体运动' },
      { id: 'time-transition', label: '时间与转场' },
      { id: 'motion-atmosphere', label: '动态氛围' },
    ],
    tags: ['运镜', '电影感', '人物', '转场', '自然', '商业'],
  },
}

function PromptCard({
  concept,
  selected,
  onToggle,
}: {
  concept: PromptConcept
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`prompt-card${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${concept.zh}，${concept.en}，${selected ? '从灵感篮移除' : '加入灵感篮'}`}
      onClick={onToggle}
    >
      <span className="card-heading">
        <span>
          <strong>{concept.zh}</strong>
          <small>{concept.en}</small>
        </span>
        <span className="add-mark" aria-hidden="true">
          {selected ? '✓' : '+'}
        </span>
      </span>
      <span className="description">{concept.description_zh}</span>
      <span className={`source source-${concept.source}`}>{sourceLabels[concept.source]}</span>
    </button>
  )
}

export function App() {
  const [mediaType, setMediaType] = useState<MediaType>('image')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  const [tag, setTag] = useState<string>()
  const [source, setSource] = useState<PromptSource>()
  const searchInput = useRef<HTMLInputElement>(null)
  const promptConcepts = builtinPromptsByMedia[mediaType]
  const { categories, tags } = libraryNavigation[mediaType]
  const tagFilters: { label: string; tag?: string }[] = [
    { label: '全部' },
    ...tags.map((value) => ({ label: value, tag: value })),
  ]
  const visiblePrompts = useMemo(
    () => filterPrompts(promptConcepts, { query, categoryId, tag, source }),
    [promptConcepts, query, categoryId, tag, source],
  )
  const hasActiveFilters = Boolean(categoryId || tag || source)
  const hasActiveCriteria = Boolean(query.trim() || hasActiveFilters)
  const selected = promptConcepts.filter((concept) => selectedIds.has(concept.id))
  const separator = language === 'zh' ? '，' : ', '
  const ending = language === 'zh' ? '。' : '.'
  const output = selected.length
    ? `${selected.map((concept) => concept[language]).join(separator)}${ending}`
    : ''

  function toggleConcept(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearCriteria() {
    setQuery('')
    setCategoryId(undefined)
    setTag(undefined)
    setSource(undefined)
  }

  function switchMedia(nextMediaType: MediaType) {
    if (nextMediaType === mediaType) return
    setMediaType(nextMediaType)
    setSelectedIds(new Set())
    clearCriteria()
  }

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }

    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <div className="workspace-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PM</span>
          <span>
            PromptMate
            <small>从词库里找到灵感</small>
          </span>
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchInput}
            type="search"
            aria-label="搜索提示词"
            placeholder="搜索人物、场景、风格、镜头……"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
          />
          <kbd>Ctrl K</kbd>
        </label>
        <div className="media-switch" aria-label="媒体类型">
          <button
            type="button"
            className={mediaType === 'image' ? 'active' : ''}
            aria-pressed={mediaType === 'image'}
            onClick={() => switchMedia('image')}
          >
            图片
          </button>
          <button
            type="button"
            className={mediaType === 'video' ? 'active' : ''}
            aria-pressed={mediaType === 'video'}
            onClick={() => switchMedia('video')}
          >
            视频
          </button>
        </div>
      </header>

      <div className="workspace">
        <nav className="sidebar" aria-label="提示词分类">
          <p className="sidebar-title">浏览词库</p>
          {categories.map((category, index) => (
            <button
              key={category.label}
              type="button"
              className={`category${categoryId === category.id ? ' active' : ''}`}
              aria-pressed={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            >
              <span aria-hidden="true">{index === 0 ? '✦' : category.label[0]}</span>
              {category.label}
            </button>
          ))}
          <div className="sidebar-divider" />
          <p className="sidebar-title">词条来源</p>
          {(Object.entries(sourceLabels) as [PromptSource, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`source-filter${source === value ? ' active' : ''}`}
              aria-pressed={source === value}
              onClick={() => setSource((current) => (current === value ? undefined : value))}
            >
              <i className={`source-dot source-${value}`} />
              {label}
            </button>
          ))}
        </nav>

        <main className="catalog">
          <div className="catalog-heading">
            <div>
              <h1>灵感词库</h1>
              <p>不必先想好答案，看到喜欢的就把它加入灵感篮。</p>
            </div>
            <span>
              {hasActiveCriteria
                ? `找到 ${visiblePrompts.length} 个词条`
                : `正在展示 ${promptConcepts.length} 个精选词条`}
            </span>
          </div>
          <div className="filter-row" aria-label="推荐筛选">
            {tagFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                className={`filter-pill${tag === filter.tag ? ' active' : ''}`}
                aria-pressed={tag === filter.tag}
                onClick={() => setTag(filter.tag)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <section aria-labelledby="browse-title">
            <div className="section-heading">
              <h2 id="browse-title">浏览全部灵感</h2>
              <span>{visiblePrompts.length} 个词条</span>
            </div>
            <div className="prompt-grid">
              {visiblePrompts.length ? (
                visiblePrompts.map((concept) => (
                  <PromptCard
                    key={concept.id}
                    concept={concept}
                    selected={selectedIds.has(concept.id)}
                    onToggle={() => toggleConcept(concept.id)}
                  />
                ))
              ) : (
                <div className="search-empty">
                  <strong>没有找到匹配的词条</strong>
                  <p>试试名称、别名、标签、分类或英文关键词。</p>
                  <button type="button" onClick={clearCriteria}>
                    {hasActiveFilters ? '清除全部筛选' : '清除搜索'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="basket" aria-label="灵感篮面板">
          <div className="basket-heading">
            <h2>灵感篮</h2>
            <span className="basket-count" aria-label="已选词条数量">
              {selected.length}
            </span>
          </div>
          <div className="selected-list">
            {selected.length ? (
              selected.map((concept) => (
                <button
                  type="button"
                  className="selected-chip"
                  aria-label={`从灵感篮移除 ${concept.zh}`}
                  onClick={() => toggleConcept(concept.id)}
                  key={concept.id}
                >
                  {concept.zh}
                  <span aria-hidden="true">×</span>
                </button>
              ))
            ) : (
              <p className="basket-empty">点击任意词条卡片，把灵感放进来。</p>
            )}
          </div>
          <div className="output-panel">
            <div className="output-heading">
              <strong>自动拼装结果</strong>
              <div className="language-switch" aria-label="输出语言">
                <button
                  type="button"
                  className={language === 'zh' ? 'active' : ''}
                  onClick={() => setLanguage('zh')}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={language === 'en' ? 'active' : ''}
                  onClick={() => setLanguage('en')}
                >
                  EN
                </button>
              </div>
            </div>
            <output className="output-text" aria-label="自动拼装结果">
              {output || '从词库选择词条，这里会自动组合。'}
            </output>
            <button type="button" className="copy-button" disabled={!selected.length}>
              复制提示词
            </button>
            <p className="offline-hint">不调用 AI 也能浏览、拼装和复制</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
