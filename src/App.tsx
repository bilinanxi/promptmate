import { useEffect, useMemo, useRef, useState } from 'react'
import { builtinPromptsByMedia } from './features/prompt-library/builtinPrompts'
import { filterPrompts } from './features/prompt-library/filterPrompts'
import {
  loadFavoriteKeys,
  makeFavoriteKey,
  saveFavoriteKeys,
} from './features/prompt-library/favoriteStorage'
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

const knownFavoriteKeys = new Set(
  (['image', 'video'] as const).flatMap((mediaType) =>
    builtinPromptsByMedia[mediaType].map((concept) => makeFavoriteKey(mediaType, concept.id)),
  ),
)

function loadFavorites() {
  try {
    return loadFavoriteKeys(window.localStorage, knownFavoriteKeys)
  } catch {
    return []
  }
}

function PromptCard({
  concept,
  selected,
  favorite,
  onToggle,
  onToggleFavorite,
}: {
  concept: PromptConcept
  selected: boolean
  favorite: boolean
  onToggle: () => void
  onToggleFavorite: () => void
}) {
  return (
    <article className={`prompt-card${selected ? ' selected' : ''}`}>
      <button
        type="button"
        className="prompt-card-action"
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
      <button
        type="button"
        className={`favorite-button${favorite ? ' active' : ''}`}
        aria-pressed={favorite}
        aria-label={`${favorite ? '取消收藏' : '收藏'} ${concept.zh}`}
        onClick={onToggleFavorite}
      >
        <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
      </button>
    </article>
  )
}

export function App() {
  const [mediaType, setMediaType] = useState<MediaType>('image')
  const [favoriteIds, setFavoriteIds] = useState<string[]>(loadFavorites)
  const [libraryView, setLibraryView] = useState<'browse' | 'favorites'>('browse')
  const [{ selectedIds, undoSelection }, setBasket] = useState<{
    selectedIds: string[]
    undoSelection: string[] | null
  }>({ selectedIds: [], undoSelection: null })
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [editedOutput, setEditedOutput] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  const [tag, setTag] = useState<string>()
  const [source, setSource] = useState<PromptSource>()
  const searchInput = useRef<HTMLInputElement>(null)
  const copyAttempt = useRef(0)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const favoritePrompts = promptConcepts.filter((concept) =>
    favoriteIds.includes(makeFavoriteKey(mediaType, concept.id)),
  )
  const visibleFavoritePrompts = visiblePrompts.filter((concept) =>
    favoriteIds.includes(makeFavoriteKey(mediaType, concept.id)),
  )
  const displayedPrompts = libraryView === 'favorites' ? visibleFavoritePrompts : visiblePrompts
  const hasActiveFilters = Boolean(categoryId || tag || source)
  const hasActiveCriteria = Boolean(query.trim() || hasActiveFilters)
  const selected = selectedIds
    .map((id) => promptConcepts.find((concept) => concept.id === id))
    .filter((concept): concept is PromptConcept => concept !== undefined)
  const separator = language === 'zh' ? '，' : ', '
  const ending = language === 'zh' ? '。' : '.'
  const output = selected.length
    ? `${selected.map((concept) => concept[language]).join(separator)}${ending}`
    : ''

  useEffect(() => {
    setEditedOutput(null)
    copyAttempt.current += 1
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current)
      feedbackTimer.current = null
    }
    setCopyFeedback('idle')
  }, [selectedIds, language])

  async function copyOutput() {
    const attempt = ++copyAttempt.current
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current)
      feedbackTimer.current = null
    }
    setCopyFeedback('idle')

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(editedOutput ?? output)
      if (attempt !== copyAttempt.current) return
      setCopyFeedback('success')
      feedbackTimer.current = setTimeout(() => {
        if (attempt === copyAttempt.current) setCopyFeedback('idle')
        feedbackTimer.current = null
      }, 2000)
    } catch {
      if (attempt === copyAttempt.current) setCopyFeedback('error')
    }
  }

  function editOutput(value: string) {
    copyAttempt.current += 1
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current)
      feedbackTimer.current = null
    }
    setCopyFeedback('idle')
    setEditedOutput(value)
  }

  function mutateBasket(update: (current: string[]) => string[]) {
    setBasket((current) => {
      const next = update(current.selectedIds)
      if (next === current.selectedIds) return current
      return { selectedIds: next, undoSelection: current.selectedIds }
    })
  }

  function toggleConcept(id: string) {
    mutateBasket((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    )
  }

  function toggleFavorite(id: string) {
    const key = makeFavoriteKey(mediaType, id)
    const next = favoriteIds.includes(key)
      ? favoriteIds.filter((favoriteId) => favoriteId !== key)
      : [...favoriteIds, key]
    try {
      saveFavoriteKeys(window.localStorage, next)
    } catch {
      // Keep favorites usable when local persistence is unavailable.
    }
    setFavoriteIds(next)
  }

  function clearBasket() {
    mutateBasket(() => [])
  }

  function moveConcept(index: number, offset: -1 | 1) {
    mutateBasket((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
  }

  function undoBasketMutation() {
    setBasket((current) =>
      current.undoSelection ? { selectedIds: current.undoSelection, undoSelection: null } : current,
    )
  }

  function clearCriteria() {
    setQuery('')
    setCategoryId(undefined)
    setTag(undefined)
    setSource(undefined)
  }

  function browseAll() {
    clearCriteria()
    setLibraryView('browse')
  }

  function switchMedia(nextMediaType: MediaType) {
    if (nextMediaType === mediaType) return
    setMediaType(nextMediaType)
    setBasket({ selectedIds: [], undoSelection: null })
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
    return () => {
      window.removeEventListener('keydown', focusSearch)
      copyAttempt.current += 1
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current)
        feedbackTimer.current = null
      }
    }
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
          <button
            type="button"
            className={`category${libraryView === 'browse' && !hasActiveCriteria ? ' active' : ''}`}
            aria-pressed={libraryView === 'browse' && !hasActiveCriteria}
            onClick={browseAll}
          >
            <span aria-hidden="true">⌂</span>
            浏览全部灵感
          </button>
          <button
            type="button"
            className={`category${libraryView === 'favorites' ? ' active' : ''}`}
            aria-pressed={libraryView === 'favorites'}
            aria-label={`我的收藏，${favoritePrompts.length} 个`}
            onClick={() => {
              clearCriteria()
              setLibraryView('favorites')
            }}
          >
            <span aria-hidden="true">★</span>
            我的收藏
            <span className="nav-count" aria-hidden="true">
              {favoritePrompts.length}
            </span>
          </button>
          {categories.map((category, index) => (
            <button
              key={category.label}
              type="button"
              className={`category${libraryView === 'browse' && categoryId === category.id ? ' active' : ''}`}
              aria-pressed={libraryView === 'browse' && categoryId === category.id}
              onClick={() => {
                setLibraryView('browse')
                setCategoryId(category.id)
              }}
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
              <h1>{libraryView === 'favorites' ? '我的收藏' : '灵感词库'}</h1>
              <p>
                {libraryView === 'favorites'
                  ? `只显示当前${mediaType === 'image' ? '图片' : '视频'}类型的收藏。`
                  : '不必先想好答案，看到喜欢的就把它加入灵感篮。'}
              </p>
            </div>
            <span>
              {libraryView === 'favorites'
                ? `${favoritePrompts.length} 个收藏`
                : hasActiveCriteria
                  ? `找到 ${visiblePrompts.length} 个词条`
                  : `正在展示 ${promptConcepts.length} 个精选词条`}
            </span>
          </div>
          {libraryView === 'browse' ? (
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
          ) : null}
          <section aria-labelledby="browse-title">
            <div className="section-heading">
              <h2 id="browse-title">
                {libraryView === 'favorites' ? '已收藏灵感' : '浏览全部灵感'}
              </h2>
              <span>{displayedPrompts.length} 个词条</span>
            </div>
            <div className="prompt-grid">
              {displayedPrompts.length ? (
                displayedPrompts.map((concept) => (
                  <PromptCard
                    key={concept.id}
                    concept={concept}
                    selected={selectedIds.includes(concept.id)}
                    favorite={favoriteIds.includes(makeFavoriteKey(mediaType, concept.id))}
                    onToggle={() => toggleConcept(concept.id)}
                    onToggleFavorite={() => toggleFavorite(concept.id)}
                  />
                ))
              ) : libraryView === 'favorites' && favoritePrompts.length === 0 ? (
                <div className="search-empty">
                  <strong>还没有收藏{mediaType === 'image' ? '图片' : '视频'}提示词</strong>
                  <p>浏览词库并点击星标，把常用灵感保存在这里。</p>
                  <button type="button" onClick={browseAll}>
                    浏览全部灵感
                  </button>
                </div>
              ) : libraryView === 'favorites' ? (
                <div className="search-empty">
                  <strong>没有找到匹配的收藏</strong>
                  <p>试试名称、别名、标签、分类或英文关键词。</p>
                  <button type="button" onClick={clearCriteria}>
                    {hasActiveFilters ? '清除全部筛选' : '清除搜索'}
                  </button>
                </div>
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
            <div className="basket-actions">
              <button
                type="button"
                aria-label="撤销上一步灵感篮操作"
                disabled={!undoSelection}
                onClick={undoBasketMutation}
              >
                撤销
              </button>
              {selected.length ? (
                <button type="button" aria-label="清空灵感篮" onClick={clearBasket}>
                  清空
                </button>
              ) : null}
            </div>
          </div>
          <div className="selected-list">
            {selected.length ? (
              selected.map((concept, index) => (
                <div className="selected-item" key={concept.id}>
                  <button
                    type="button"
                    className="selected-chip"
                    aria-label={`从灵感篮移除 ${concept.zh}`}
                    onClick={() => toggleConcept(concept.id)}
                  >
                    {concept.zh}
                    <span aria-hidden="true">×</span>
                  </button>
                  <div className="order-controls">
                    <button
                      type="button"
                      aria-label={`上移 ${concept.zh}`}
                      disabled={index === 0}
                      onClick={() => moveConcept(index, -1)}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`下移 ${concept.zh}`}
                      disabled={index === selected.length - 1}
                      onClick={() => moveConcept(index, 1)}
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </div>
                </div>
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
            {selected.length ? (
              <textarea
                className="output-text"
                aria-label="编辑拼装结果"
                value={editedOutput ?? output}
                onChange={(event) => editOutput(event.target.value)}
              />
            ) : (
              <output className="output-text" aria-label="自动拼装结果">
                从词库选择词条，这里会自动组合。
              </output>
            )}
            <button
              type="button"
              className="copy-button"
              disabled={!selected.length || !(editedOutput ?? output).trim()}
              onClick={copyOutput}
            >
              复制提示词
            </button>
            {copyFeedback === 'success' ? (
              <p className="copy-feedback success" role="status" aria-live="polite">
                已复制到剪贴板
              </p>
            ) : null}
            {copyFeedback === 'error' ? (
              <p className="copy-feedback error" role="alert">
                复制失败，请检查剪贴板权限后重试。
              </p>
            ) : null}
            <p className="offline-hint">不调用 AI 也能浏览、拼装和复制</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
