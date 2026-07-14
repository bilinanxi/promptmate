import { useState } from 'react'
import { promptConcepts, type PromptConcept, type PromptSource } from './data/prompts'
import './styles.css'

const sourceLabels: Record<PromptSource, string> = {
  builtin: '内置精选',
  user: '我的词条',
  imported: '社区导入',
  ai_generated: 'AI 生成',
}

const categories = [
  '为你推荐',
  '人物主体',
  '场景环境',
  '动作姿态',
  '服装配饰',
  '灯光氛围',
  '镜头构图',
  '艺术风格',
]

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
      <span className="description">{concept.description}</span>
      <span className={`source source-${concept.source}`}>{sourceLabels[concept.source]}</span>
    </button>
  )
}

export function App() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
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
          <input aria-label="搜索提示词" placeholder="搜索人物、场景、风格、镜头……" />
          <kbd>Ctrl K</kbd>
        </label>
        <div className="media-switch" aria-label="媒体类型">
          <button type="button" className="active">
            图片
          </button>
          <button type="button" disabled>
            视频
          </button>
        </div>
      </header>

      <div className="workspace">
        <nav className="sidebar" aria-label="提示词分类">
          <p className="sidebar-title">浏览词库</p>
          {categories.map((category, index) => (
            <div key={category} className={`category${index === 0 ? ' active' : ''}`}>
              <span aria-hidden="true">{index === 0 ? '✦' : category[0]}</span>
              {category}
            </div>
          ))}
          <div className="sidebar-divider" />
          <p className="sidebar-title">词条来源</p>
          {Object.entries(sourceLabels).map(([source, label]) => (
            <div key={source} className="source-filter">
              <i className={`source-dot source-${source}`} />
              {label}
            </div>
          ))}
        </nav>

        <main className="catalog">
          <div className="catalog-heading">
            <div>
              <h1>灵感词库</h1>
              <p>不必先想好答案，看到喜欢的就把它加入灵感篮。</p>
            </div>
            <span>正在展示 {promptConcepts.length} 个精选词条</span>
          </div>
          <div className="filter-row" aria-label="推荐筛选">
            {['全部', '新手友好', '人像', '电影感', '东方美学', '自然', '商业'].map(
              (filter, index) => (
                <span key={filter} className={`filter-pill${index === 0 ? ' active' : ''}`}>
                  {filter}
                </span>
              ),
            )}
          </div>
          <section aria-labelledby="browse-title">
            <div className="section-heading">
              <h2 id="browse-title">浏览全部灵感</h2>
              <span>{promptConcepts.length} 个词条</span>
            </div>
            <div className="prompt-grid">
              {promptConcepts.map((concept) => (
                <PromptCard
                  key={concept.id}
                  concept={concept}
                  selected={selectedIds.has(concept.id)}
                  onToggle={() => toggleConcept(concept.id)}
                />
              ))}
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
                <span className="selected-chip" key={concept.id}>
                  {concept.zh}
                </span>
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
