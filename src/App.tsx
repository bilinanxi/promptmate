import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'

import { builtinPresetsByMedia } from './features/prompt-library/builtinPresets'
import { builtinPromptsByMedia } from './features/prompt-library/builtinPrompts'
import { filterPrompts } from './features/prompt-library/filterPrompts'
import { libraryCatalog } from './features/prompt-library/libraryCatalog'
import {
  MAX_IMPORT_BYTES,
  parsePromptImport,
  type ImportPreview,
} from './features/prompt-library/parsePromptImport'
import { serializePromptCsv } from './features/prompt-library/promptCsv'
import {
  planPromptImport,
  type ImportConflictPolicy,
  type ImportPlanResult,
} from './features/prompt-library/planPromptImport'
import {
  loadFavoriteKeys,
  makeFavoriteKey,
  saveFavoriteKeys,
} from './features/prompt-library/favoriteStorage'
import {
  addRecentUsage,
  loadRecentUsage,
  saveRecentUsage,
  type RecentUsageRecord,
} from './features/prompt-library/recentUsageStorage'
import {
  selectPromptExport,
  serializePromptJsonl,
  serializePromptPackage,
  type ExportMediaScope,
  type ExportSourceScope,
} from './features/prompt-library/serializePromptExport'
import {
  makeImportReportFileName,
  serializeImportReport,
} from './features/prompt-library/serializeImportReport'
import { saveTextDownload } from './features/prompt-library/saveTextDownload'
import {
  MAX_USER_PROMPTS,
  loadUserPrompts,
  makeUserPromptId,
  saveUserPrompts,
} from './features/prompt-library/userPromptStorage'
import type { MediaType, PromptConcept, PromptSource } from './features/prompt-library/types'
import './styles.css'

const sourceLabels: Record<PromptSource, string> = {
  builtin: '内置精选',
  user: '我的词条',
  imported: '社区导入',
  ai_generated: 'AI 生成',
}

const importResultLabels: Record<ImportPlanResult, string> = {
  add: '新增',
  skip: '跳过',
  replace: '替换',
  copy: '副本',
  blocked: '阻断',
}

const importReasonLabels = {
  ambiguous: '同一候选匹配了多个目标，请修改 id 或双语名称。',
  'builtin-replace': '内置词条不能被替换，请选择跳过或创建副本。',
  'media-change': '替换不能改变媒体类型。',
  'incoming-replace': '不能替换本次导入中新增的词条。',
  limit: '导入后将超过本机词条数量上限。',
} as const

const allBuiltinPrompts = [...builtinPromptsByMedia.image, ...builtinPromptsByMedia.video]

interface CreatePromptDraft {
  zh: string
  en: string
  descriptionZh: string
  descriptionEn: string
  categoryId: string
  tags: string
  aliasesZh: string
  aliasesEn: string
}

const emptyCreateDraft: CreatePromptDraft = {
  zh: '',
  en: '',
  descriptionZh: '',
  descriptionEn: '',
  categoryId: '',
  tags: '',
  aliasesZh: '',
  aliasesEn: '',
}

function promptsForMedia(mediaType: MediaType, userPrompts: readonly PromptConcept[]) {
  return [
    ...builtinPromptsByMedia[mediaType],
    ...userPrompts.filter((prompt) => prompt.media_types[0] === mediaType),
  ]
}

function isManagedPrompt(prompt: PromptConcept) {
  return prompt.source === 'user' || prompt.source === 'imported'
}

function loadUsers() {
  try {
    return loadUserPrompts(window.localStorage)
  } catch {
    return []
  }
}

function loadFavorites(userPrompts: readonly PromptConcept[]) {
  const knownKeys = new Set(
    (['image', 'video'] as const).flatMap((mediaType) =>
      promptsForMedia(mediaType, userPrompts).map((concept) =>
        makeFavoriteKey(mediaType, concept.id),
      ),
    ),
  )
  try {
    return loadFavoriteKeys(window.localStorage, knownKeys)
  } catch {
    return []
  }
}

function loadRecent(userPrompts: readonly PromptConcept[]) {
  const knownIds = {
    image: new Set(promptsForMedia('image', userPrompts).map(({ id }) => id)),
    video: new Set(promptsForMedia('video', userPrompts).map(({ id }) => id)),
  }
  try {
    return loadRecentUsage(window.localStorage, knownIds)
  } catch {
    return []
  }
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function formatUsedAt(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function readFileBytes(file: File, reader: FileReader): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.onabort = () => reject(new DOMException('File read aborted', 'AbortError'))
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('File read returned an unexpected result'))
        return
      }
      resolve(new Uint8Array(reader.result))
    }
    reader.readAsArrayBuffer(file)
  })
}

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function useModalFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  openerRef: RefObject<HTMLElement | null>,
  fallbackFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const opener = openerRef.current
    const fallbackFocus = fallbackFocusRef.current
    if (!dialog) return

    ;(initialFocusRef.current ?? dialog).focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (opener?.isConnected) {
        opener.focus()
        return
      }

      const active = document.activeElement
      if (!(active instanceof HTMLElement) || active === document.body || !active.isConnected) {
        fallbackFocus?.focus()
      }
    }
  }, [open, dialogRef, fallbackFocusRef, initialFocusRef, openerRef])
}

function PromptCard({
  concept,
  selected,
  favorite,
  onToggle,
  onToggleFavorite,
  onCopy,
  onEdit,
  onDelete,
}: {
  concept: PromptConcept
  selected: boolean
  favorite: boolean
  onToggle: () => void
  onToggleFavorite: () => void
  onCopy?: () => void
  onEdit?: () => void
  onDelete?: () => void
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
      {onCopy ? (
        <button
          type="button"
          className="copy-prompt-button"
          aria-label={`复制并编辑 ${concept.zh}`}
          onClick={onCopy}
        >
          复制并编辑
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          className="edit-prompt-button"
          aria-label={`编辑 ${concept.zh}`}
          onClick={onEdit}
        >
          编辑
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className="delete-prompt-button"
          aria-label={`删除 ${concept.zh}`}
          onClick={onDelete}
        >
          删除
        </button>
      ) : null}
    </article>
  )
}

export function App() {
  const [mediaType, setMediaType] = useState<MediaType>('image')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [transferTab, setTransferTab] = useState<'import' | 'export'>('import')
  const [exportMediaScope, setExportMediaScope] = useState<ExportMediaScope>('current')
  const [exportSourceScope, setExportSourceScope] = useState<ExportSourceScope>('all')
  const [exportFormat, setExportFormat] = useState<'jsonl' | 'package' | 'csv'>('jsonl')
  const [exportError, setExportError] = useState('')
  const [exportFeedback, setExportFeedback] = useState('')
  const [exportSaving, setExportSaving] = useState(false)
  const [reportSaving, setReportSaving] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importPolicy, setImportPolicy] = useState<ImportConflictPolicy>('skip')
  const [importError, setImportError] = useState('')
  const [importFeedback, setImportFeedback] = useState<number | null>(null)
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [copyingPromptId, setCopyingPromptId] = useState<string | null>(null)
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<CreatePromptDraft>(emptyCreateDraft)
  const [createError, setCreateError] = useState('')
  const [createFeedback, setCreateFeedback] = useState<
    | 'create-durable'
    | 'create-session'
    | 'edit-durable'
    | 'edit-session'
    | 'edit-imported-durable'
    | 'edit-imported-session'
    | 'copy-durable'
    | 'copy-session'
    | 'delete-durable'
    | 'delete-session'
    | 'delete-imported-durable'
    | 'delete-imported-session'
    | null
  >(null)
  const [userPrompts, setUserPrompts] = useState<PromptConcept[]>(loadUsers)
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadFavorites(userPrompts))
  const [recentUsage, setRecentUsage] = useState<RecentUsageRecord[]>(() => loadRecent(userPrompts))
  const [libraryView, setLibraryView] = useState<
    'all' | 'favorites' | 'recent' | 'templates' | 'recommended'
  >('all')
  const [recommendationOffset, setRecommendationOffset] = useState(0)
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
  const modalOpener = useRef<HTMLElement>(null)
  const modalFallbackFocus = useRef<HTMLButtonElement>(null)
  const createDialog = useRef<HTMLElement>(null)
  const createInitialFocus = useRef<HTMLInputElement>(null)
  const importDialog = useRef<HTMLElement>(null)
  const importInitialFocus = useRef<HTMLInputElement>(null)
  const importSelection = useRef(0)
  const importReader = useRef<FileReader | null>(null)
  const exportSaveAttempt = useRef(0)
  const exportSavePending = useRef(false)
  const reportSaveAttempt = useRef(0)
  const reportSavePending = useRef(false)
  const deleteDialog = useRef<HTMLElement>(null)
  const deleteInitialFocus = useRef<HTMLButtonElement>(null)
  const copyAttempt = useRef(0)
  const recentSequence = useRef(0)
  const preserveEditedOutput = useRef(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      importSelection.current += 1
      importReader.current?.abort()
      importReader.current = null
      exportSaveAttempt.current += 1
      reportSaveAttempt.current += 1
      exportSavePending.current = false
      reportSavePending.current = false
    },
    [],
  )

  const promptConcepts = promptsForMedia(mediaType, userPrompts)
  const { categories, tags } = libraryCatalog[mediaType]
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
  const recentForMedia = recentUsage.filter((record) => record.mediaType === mediaType)
  const presets = builtinPresetsByMedia[mediaType]
  const recommendationSize = mediaType === 'image' ? 6 : 4
  const recommendedPrompts = promptConcepts.slice(
    recommendationOffset,
    recommendationOffset + recommendationSize,
  )
  const displayedPrompts =
    libraryView === 'favorites'
      ? visiblePrompts.filter((concept) =>
          favoriteIds.includes(makeFavoriteKey(mediaType, concept.id)),
        )
      : libraryView === 'recommended'
        ? recommendedPrompts
        : visiblePrompts
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
  const deleteTarget = userPrompts.find(
    (prompt) =>
      prompt.id === deletePromptId &&
      isManagedPrompt(prompt) &&
      prompt.media_types[0] === mediaType,
  )
  const modalOpen = createOpen || importOpen || Boolean(deleteTarget)
  const importPlan = useMemo(
    () =>
      importPreview
        ? planPromptImport({
            incoming: importPreview.candidates,
            managed: userPrompts,
            builtins: allBuiltinPrompts,
            policy: importPolicy,
          })
        : null,
    [importPolicy, importPreview, userPrompts],
  )
  const importTransactionBlocked = Boolean(importPreview?.blocked || importPlan?.blocked)
  const hasImportReport = Boolean(
    importPreview &&
    importPlan &&
    (importPreview.issues.length || importPlan.rows.some(({ conflicts }) => conflicts.length > 0)),
  )
  const exportPrompts = useMemo(
    () =>
      selectPromptExport([...allBuiltinPrompts, ...userPrompts], {
        currentMedia: mediaType,
        media: exportMediaScope,
        source: exportSourceScope,
      }),
    [exportMediaScope, exportSourceScope, mediaType, userPrompts],
  )

  useModalFocus(
    importOpen,
    importDialog,
    importInitialFocus,
    modalOpener,
    modalFallbackFocus,
    closeImportDialog,
  )
  useModalFocus(
    createOpen,
    createDialog,
    createInitialFocus,
    modalOpener,
    modalFallbackFocus,
    closeCreateDialog,
  )
  useModalFocus(
    Boolean(deleteTarget),
    deleteDialog,
    deleteInitialFocus,
    modalOpener,
    modalFallbackFocus,
    () => setDeletePromptId(null),
  )

  useEffect(() => {
    if (preserveEditedOutput.current) {
      preserveEditedOutput.current = false
    } else {
      setEditedOutput(null)
    }
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
      const copiedText = editedOutput ?? output
      await navigator.clipboard.writeText(copiedText)
      if (attempt !== copyAttempt.current) return
      const usedAt = Date.now()
      let recentId: string
      do {
        recentId = `${mediaType}-${usedAt}-${recentSequence.current++}`
      } while (recentUsage.some((record) => record.id === recentId))
      const nextRecent = addRecentUsage(recentUsage, {
        id: recentId,
        mediaType,
        promptIds: [...selectedIds],
        language,
        copiedText,
        usedAt,
      })
      try {
        saveRecentUsage(window.localStorage, nextRecent)
      } catch {
        // Keep recent usage available in memory when storage access is blocked.
      }
      setRecentUsage(nextRecent)
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

  function replaceBasket(ids: readonly string[]) {
    mutateBasket(() => [...ids])
  }

  function applyPreset(promptIds: readonly string[]) {
    replaceBasket(promptIds)
    setEditedOutput(null)
  }

  function reuseRecent(record: RecentUsageRecord) {
    preserveEditedOutput.current = true
    replaceBasket(record.promptIds)
    setLanguage(record.language)
    setEditedOutput(record.copiedText)
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
    setLibraryView('all')
  }

  function showAllWithCriteria() {
    setLibraryView((current) => (current === 'favorites' ? current : 'all'))
  }

  function captureModalOpener() {
    modalOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  function openImportDialog() {
    captureModalOpener()
    setImportOpen(true)
  }

  function closeImportDialog() {
    importSelection.current += 1
    importReader.current?.abort()
    importReader.current = null
    exportSaveAttempt.current += 1
    reportSaveAttempt.current += 1
    exportSavePending.current = false
    reportSavePending.current = false
    setImportOpen(false)
    setTransferTab('import')
    setExportMediaScope('current')
    setExportSourceScope('all')
    setExportFormat('jsonl')
    setExportError('')
    setExportFeedback('')
    setExportSaving(false)
    setReportSaving(false)
    setImportPreview(null)
    setImportPolicy('skip')
    setImportError('')
  }

  async function selectImportFile(file: File | undefined) {
    const selection = ++importSelection.current
    importReader.current?.abort()
    importReader.current = null
    setImportPreview(null)
    setImportError('')
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const format = lowerName.endsWith('.promptmate.json')
      ? 'package'
      : lowerName.endsWith('.jsonl')
        ? 'jsonl'
        : lowerName.endsWith('.csv')
          ? 'csv'
          : null
    if (!format) {
      setImportError('仅支持 .jsonl、.csv 或 .promptmate.json 文件。')
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(`文件不能超过 ${MAX_IMPORT_BYTES} 字节。`)
      return
    }
    const reader = new FileReader()
    importReader.current = reader
    try {
      const bytes = await readFileBytes(file, reader)
      if (selection !== importSelection.current) return
      setImportPreview(parsePromptImport({ fileName: file.name, format, bytes }))
    } catch {
      if (selection !== importSelection.current) return
      setImportError('无法读取文件，请重新选择后重试。')
    } finally {
      if (importReader.current === reader) importReader.current = null
    }
  }

  async function downloadExport() {
    if (!exportPrompts.length || exportSavePending.current) return
    const attempt = ++exportSaveAttempt.current
    exportSavePending.current = true
    setExportSaving(true)
    const mediaName = exportMediaScope === 'current' ? mediaType : 'all'
    const extension =
      exportFormat === 'jsonl' ? 'jsonl' : exportFormat === 'csv' ? 'csv' : 'promptmate.json'
    const content =
      exportFormat === 'jsonl'
        ? serializePromptJsonl(exportPrompts)
        : exportFormat === 'csv'
          ? serializePromptCsv(exportPrompts)
          : serializePromptPackage(exportPrompts)
    try {
      const result = await saveTextDownload({
        content,
        fileName: `promptmate-${mediaName}-${exportSourceScope}.${extension}`,
        mimeType:
          exportFormat === 'jsonl'
            ? 'application/x-ndjson;charset=utf-8'
            : exportFormat === 'csv'
              ? 'text/csv;charset=utf-8'
              : 'application/json;charset=utf-8',
      })
      if (attempt !== exportSaveAttempt.current) return
      setExportError('')
      setExportFeedback(
        result === 'saved' ? '已导出到所选位置。' : result === 'downloaded' ? '下载已开始。' : '',
      )
    } catch {
      if (attempt !== exportSaveAttempt.current) return
      setExportFeedback('')
      setExportError('导出失败，请检查文件保存权限后重试。')
    } finally {
      if (attempt === exportSaveAttempt.current) {
        exportSavePending.current = false
        setExportSaving(false)
      }
    }
  }

  async function downloadImportReport() {
    if (!importPreview || !importPlan || !hasImportReport || reportSavePending.current) return
    const attempt = ++reportSaveAttempt.current
    reportSavePending.current = true
    setReportSaving(true)
    try {
      await saveTextDownload({
        content: serializeImportReport({ preview: importPreview, plan: importPlan }),
        fileName: makeImportReportFileName(importPreview.fileName),
        mimeType: 'application/json;charset=utf-8',
      })
      if (attempt !== reportSaveAttempt.current) return
      setImportError('')
    } catch {
      if (attempt !== reportSaveAttempt.current) return
      setImportError('导入报告下载失败，请重试。')
    } finally {
      if (attempt === reportSaveAttempt.current) {
        reportSavePending.current = false
        setReportSaving(false)
      }
    }
  }

  function applyImport() {
    if (
      !importPreview ||
      !importPlan?.finalPrompts ||
      importTransactionBlocked ||
      !importPlan.changedCount
    )
      return
    const nextManaged = [...importPlan.finalPrompts]
    let durable = false
    try {
      durable = saveUserPrompts(window.localStorage, nextManaged)
    } catch {
      durable = false
    }
    if (!durable) {
      setImportError('导入未保存，请重试。现有词库未发生变化。')
      return
    }

    setUserPrompts(nextManaged)
    setLibraryView('all')
    clearCriteria()
    setImportFeedback(importPlan.changedCount)
    closeImportDialog()
  }

  function openCreateDialog() {
    captureModalOpener()
    setCreateOpen(true)
  }

  function openDeleteDialog(id: string) {
    captureModalOpener()
    setDeletePromptId(id)
  }

  function closeCreateDialog() {
    setCreateOpen(false)
    setEditingPromptId(null)
    setCopyingPromptId(null)
    setCreateDraft(emptyCreateDraft)
    setCreateError('')
  }

  function openEditDialog(id: string) {
    const prompt = userPrompts.find(
      (candidate) =>
        candidate.id === id && isManagedPrompt(candidate) && candidate.media_types[0] === mediaType,
    )
    if (!prompt) return
    captureModalOpener()
    setEditingPromptId(prompt.id)
    setCreateDraft({
      zh: prompt.zh,
      en: prompt.en,
      descriptionZh: prompt.description_zh,
      descriptionEn: prompt.description_en,
      categoryId: prompt.category_id,
      tags: prompt.tags.join(', '),
      aliasesZh: prompt.aliases_zh.join(', '),
      aliasesEn: prompt.aliases_en.join(', '),
    })
    setCreateError('')
    setCreateOpen(true)
  }

  function openCopyDialog(id: string) {
    const prompt = builtinPromptsByMedia[mediaType].find(
      (candidate) => candidate.id === id && candidate.source === 'builtin',
    )
    if (!prompt) return
    captureModalOpener()
    setCopyingPromptId(prompt.id)
    setCreateDraft({
      zh: prompt.zh,
      en: prompt.en,
      descriptionZh: prompt.description_zh,
      descriptionEn: prompt.description_en,
      categoryId: prompt.category_id,
      tags: prompt.tags.join(', '),
      aliasesZh: prompt.aliases_zh.join(', '),
      aliasesEn: prompt.aliases_en.join(', '),
    })
    setCreateError('')
    setCreateOpen(true)
  }

  function updateCreateDraft(field: keyof CreatePromptDraft, value: string) {
    setCreateDraft((current) => ({ ...current, [field]: value }))
    setCreateError('')
  }

  function submitCreatePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const copyOrigin = copyingPromptId
      ? builtinPromptsByMedia[mediaType].find(
          (candidate) => candidate.id === copyingPromptId && candidate.source === 'builtin',
        )
      : undefined
    if (copyingPromptId && !copyOrigin) {
      closeCreateDialog()
      return
    }
    const required = [createDraft.zh, createDraft.en, createDraft.categoryId]
    if (required.some((value) => !value.trim())) {
      setCreateError('请填写中文名称、英文名称和分类。')
      return
    }

    const zh = createDraft.zh.trim()
    const en = createDraft.en.trim().toLowerCase()
    if (
      promptConcepts.some(
        (concept) =>
          concept.id !== editingPromptId &&
          (concept.zh.trim() === zh || concept.en.trim().toLowerCase() === en),
      )
    ) {
      setCreateError('中文或英文名称已存在。')
      return
    }
    if (!editingPromptId && userPrompts.length >= MAX_USER_PROMPTS) {
      setCreateError(`最多可创建 ${MAX_USER_PROMPTS} 个词条。`)
      return
    }

    const occupiedIds = new Set([
      ...builtinPromptsByMedia.image.map(({ id }) => id),
      ...builtinPromptsByMedia.video.map(({ id }) => id),
      ...userPrompts.map(({ id }) => id),
    ])
    const editedPrompt = editingPromptId
      ? userPrompts.find(
          (candidate) =>
            candidate.id === editingPromptId &&
            isManagedPrompt(candidate) &&
            candidate.media_types[0] === mediaType,
        )
      : undefined
    if (editingPromptId && !editedPrompt) {
      closeCreateDialog()
      return
    }
    const prompt: PromptConcept = {
      schema_version: editedPrompt?.schema_version ?? '1.0',
      id: editedPrompt?.id ?? makeUserPromptId(createDraft.en.trim(), occupiedIds),
      zh,
      en: createDraft.en.trim(),
      description_zh: createDraft.descriptionZh.trim(),
      description_en: createDraft.descriptionEn.trim(),
      category_id: createDraft.categoryId,
      tags: parseList(createDraft.tags),
      aliases_zh: parseList(createDraft.aliasesZh),
      aliases_en: parseList(createDraft.aliasesEn),
      media_types: editedPrompt?.media_types ?? [mediaType],
      source: editedPrompt?.source ?? 'user',
      status: editedPrompt?.status ?? 'approved',
    }
    const next = editedPrompt
      ? userPrompts.map((candidate) => (candidate.id === editedPrompt.id ? prompt : candidate))
      : [...userPrompts, prompt]
    let durable = false
    try {
      durable = saveUserPrompts(window.localStorage, next)
    } catch {
      durable = false
    }
    setUserPrompts(next)
    setLibraryView('all')
    clearCriteria()
    setSource(editedPrompt?.source ?? 'user')
    setCreateFeedback(
      copyOrigin
        ? durable
          ? 'copy-durable'
          : 'copy-session'
        : editedPrompt
          ? editedPrompt.source === 'imported'
            ? durable
              ? 'edit-imported-durable'
              : 'edit-imported-session'
            : durable
              ? 'edit-durable'
              : 'edit-session'
          : durable
            ? 'create-durable'
            : 'create-session',
    )
    closeCreateDialog()
  }

  function confirmDeletePrompt() {
    const target = userPrompts.find(
      (prompt) =>
        prompt.id === deletePromptId &&
        isManagedPrompt(prompt) &&
        prompt.media_types[0] === mediaType,
    )
    if (!target) {
      setDeletePromptId(null)
      return
    }

    const nextUsers = userPrompts.filter((prompt) => prompt.id !== target.id)
    const favoriteKey = makeFavoriteKey(mediaType, target.id)
    const nextFavorites = favoriteIds.filter((key) => key !== favoriteKey)
    const nextRecent = recentUsage.filter(
      (record) => !(record.mediaType === mediaType && record.promptIds.includes(target.id)),
    )
    const persist = (write: (storage: Storage) => boolean) => {
      try {
        return write(window.localStorage)
      } catch {
        return false
      }
    }
    const usersSaved = persist((storage) => saveUserPrompts(storage, nextUsers))
    const favoritesSaved = persist((storage) => saveFavoriteKeys(storage, nextFavorites))
    const recentSaved = persist((storage) => saveRecentUsage(storage, nextRecent))

    setUserPrompts(nextUsers)
    setFavoriteIds(nextFavorites)
    setRecentUsage(nextRecent)
    const targetWasSelected = selectedIds.includes(target.id)
    setBasket((current) => {
      const selectedIds = current.selectedIds.includes(target.id)
        ? current.selectedIds.filter((id) => id !== target.id)
        : current.selectedIds
      const undoSelection = current.undoSelection?.includes(target.id)
        ? current.undoSelection.filter((id) => id !== target.id)
        : current.undoSelection
      if (selectedIds === current.selectedIds && undoSelection === current.undoSelection)
        return current
      return { selectedIds, undoSelection }
    })
    if (targetWasSelected) setEditedOutput(null)
    setLibraryView('all')
    clearCriteria()
    setSource(target.source)
    setCreateFeedback(
      target.source === 'imported'
        ? usersSaved && favoritesSaved && recentSaved
          ? 'delete-imported-durable'
          : 'delete-imported-session'
        : usersSaved && favoritesSaved && recentSaved
          ? 'delete-durable'
          : 'delete-session',
    )
    setDeletePromptId(null)
  }

  function switchMedia(nextMediaType: MediaType) {
    if (nextMediaType === mediaType) return
    closeCreateDialog()
    closeImportDialog()
    setDeletePromptId(null)
    setMediaType(nextMediaType)
    setLibraryView('all')
    setBasket({ selectedIds: [], undoSelection: null })
    setRecommendationOffset(0)
    clearCriteria()
  }

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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
      <div className="app-content" data-testid="app-content" inert={modalOpen || undefined}>
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
              onChange={(event) => {
                setQuery(event.target.value)
                showAllWithCriteria()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setQuery('')
                  showAllWithCriteria()
                }
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
              className={`category${libraryView === 'all' && !hasActiveCriteria ? ' active' : ''}`}
              aria-pressed={libraryView === 'all' && !hasActiveCriteria}
              onClick={browseAll}
            >
              <span aria-hidden="true">⌂</span>
              浏览全部灵感
            </button>
            <button
              type="button"
              className={`category${libraryView === 'recommended' ? ' active' : ''}`}
              aria-pressed={libraryView === 'recommended'}
              onClick={() => {
                clearCriteria()
                setLibraryView('recommended')
              }}
            >
              <span aria-hidden="true">✦</span>
              为你推荐
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
            <button
              type="button"
              className={`category${libraryView === 'recent' ? ' active' : ''}`}
              aria-pressed={libraryView === 'recent'}
              aria-label={`最近使用，${recentForMedia.length} 条`}
              onClick={() => {
                clearCriteria()
                setLibraryView('recent')
              }}
            >
              <span aria-hidden="true">◷</span>
              最近使用
              <span className="nav-count" aria-hidden="true">
                {recentForMedia.length}
              </span>
            </button>
            <button
              type="button"
              className={`category${libraryView === 'templates' ? ' active' : ''}`}
              aria-pressed={libraryView === 'templates'}
              onClick={() => {
                clearCriteria()
                setLibraryView('templates')
              }}
            >
              <span aria-hidden="true">▦</span>
              模板组合
            </button>
            {categories.map((category) => (
              <button
                key={category.label}
                type="button"
                className={`category${libraryView === 'all' && categoryId === category.id ? ' active' : ''}`}
                aria-pressed={libraryView === 'all' && categoryId === category.id}
                onClick={() => {
                  setLibraryView('all')
                  setCategoryId(category.id)
                }}
              >
                <span aria-hidden="true">{category.label[0]}</span>
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
                onClick={() => {
                  setLibraryView('all')
                  setSource((current) => (current === value ? undefined : value))
                }}
              >
                <i className={`source-dot source-${value}`} />
                {label}
              </button>
            ))}
          </nav>

          <main className="catalog">
            <div className="catalog-heading">
              <div>
                <h1>
                  {libraryView === 'favorites'
                    ? '我的收藏'
                    : libraryView === 'recent'
                      ? '最近使用'
                      : libraryView === 'templates'
                        ? '模板组合'
                        : libraryView === 'recommended'
                          ? '为你推荐'
                          : '灵感词库'}
                </h1>
                <p>
                  {libraryView === 'favorites'
                    ? `只显示当前${mediaType === 'image' ? '图片' : '视频'}类型的收藏。`
                    : libraryView === 'recent'
                      ? '找回成功复制过的完整提示词，包括当时的手动修改。'
                      : libraryView === 'templates'
                        ? '用经过策划的组合快速开始，再按需要继续调整。'
                        : libraryView === 'recommended'
                          ? '从当前词库中挑选一组灵感，换一批可查看另一半。'
                          : '不必先想好答案，看到喜欢的就把它加入灵感篮。'}
                </p>
              </div>
              <div className="catalog-heading-actions">
                <span>
                  {libraryView === 'favorites'
                    ? hasActiveCriteria
                      ? `${displayedPrompts.length} 个词条`
                      : `${favoritePrompts.length} 个收藏`
                    : libraryView === 'recent'
                      ? `${recentForMedia.length} 条记录`
                      : libraryView === 'templates'
                        ? `${presets.length} 个模板`
                        : libraryView === 'recommended'
                          ? `${recommendedPrompts.length} 个推荐`
                          : hasActiveCriteria
                            ? `找到 ${visiblePrompts.length} 个词条`
                            : `正在展示 ${promptConcepts.length} 个精选词条`}
                </span>
                <button type="button" className="import-export-button" onClick={openImportDialog}>
                  导入与导出
                </button>
                <button
                  ref={modalFallbackFocus}
                  type="button"
                  className="create-prompt-button"
                  onClick={openCreateDialog}
                >
                  新建词条
                </button>
              </div>
            </div>
            {importFeedback !== null ? (
              <p className="create-feedback create-durable" role="status" aria-live="polite">
                已成功导入 {importFeedback} 条社区词条。
              </p>
            ) : null}
            {createFeedback ? (
              <p className={`create-feedback ${createFeedback}`} role="status" aria-live="polite">
                {createFeedback === 'create-durable'
                  ? '词条已保存到本机。'
                  : createFeedback === 'create-session'
                    ? '词条已添加到当前会话，但无法保存到本机。'
                    : createFeedback === 'copy-durable'
                      ? '词条副本已保存到我的词条。'
                      : createFeedback === 'copy-session'
                        ? '词条副本已添加到当前会话，但无法保存到本机。'
                        : createFeedback === 'edit-imported-durable'
                          ? '社区词条已更新。'
                          : createFeedback === 'edit-imported-session'
                            ? '社区词条已在当前会话更新，但无法保存到本机。'
                            : createFeedback === 'edit-durable'
                              ? '词条修改已保存到本机。'
                              : createFeedback === 'edit-session'
                                ? '词条修改已应用到当前会话，但无法保存到本机。'
                                : createFeedback === 'delete-imported-durable'
                                  ? '社区词条已删除。'
                                  : createFeedback === 'delete-imported-session'
                                    ? '社区词条已从当前会话删除，但部分本地数据可能未保存。'
                                    : createFeedback === 'delete-durable'
                                      ? '词条已从本机删除。'
                                      : '词条已从当前会话删除，但部分本地数据可能未保存。'}
              </p>
            ) : null}
            {libraryView === 'all' ? (
              <div className="filter-row" aria-label="推荐筛选">
                {tagFilters.map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    className={`filter-pill${tag === filter.tag ? ' active' : ''}`}
                    aria-pressed={tag === filter.tag}
                    onClick={() => {
                      setLibraryView('all')
                      setTag(filter.tag)
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}
            <section aria-labelledby="browse-title">
              <div className="section-heading">
                <h2 id="browse-title">
                  {libraryView === 'favorites'
                    ? '已收藏灵感'
                    : libraryView === 'recent'
                      ? '复制历史'
                      : libraryView === 'templates'
                        ? '精选模板'
                        : libraryView === 'recommended'
                          ? '本批推荐'
                          : '浏览全部灵感'}
                </h2>
                {libraryView === 'recommended' ? (
                  <button
                    type="button"
                    className="shuffle-button"
                    onClick={() =>
                      setRecommendationOffset((current) => (current === 0 ? recommendationSize : 0))
                    }
                  >
                    换一批
                  </button>
                ) : null}
              </div>
              {libraryView === 'recent' ? (
                <div className="recent-grid">
                  {recentForMedia.length ? (
                    recentForMedia.map((record) => {
                      const names = record.promptIds
                        .map((id) => promptConcepts.find((concept) => concept.id === id)?.zh)
                        .filter((name): name is string => Boolean(name))
                      return (
                        <article className="recent-card" key={record.id}>
                          <div className="recent-meta">
                            <time dateTime={new Date(record.usedAt).toISOString()}>
                              {formatUsedAt(record.usedAt)}
                            </time>
                            <span>{record.language === 'zh' ? '中文' : 'English'}</span>
                          </div>
                          <pre>{record.copiedText}</pre>
                          <p>{names.join(' · ')}</p>
                          <button
                            type="button"
                            aria-label={`再次使用 ${record.copiedText.replace(/\s+/g, ' ')}`}
                            onClick={() => reuseRecent(record)}
                          >
                            再次使用
                          </button>
                        </article>
                      )
                    })
                  ) : (
                    <div className="search-empty">
                      <strong>还没有最近使用记录</strong>
                      <p>成功复制提示词后，会在这里保留当时的组合与编辑内容。</p>
                      <button type="button" onClick={browseAll}>
                        浏览全部灵感
                      </button>
                    </div>
                  )}
                </div>
              ) : libraryView === 'templates' ? (
                <div className="template-grid">
                  {presets.map((preset) => {
                    const names = preset.promptIds.map(
                      (id) => promptConcepts.find((concept) => concept.id === id)?.zh ?? id,
                    )
                    return (
                      <article className="template-card" key={preset.id}>
                        <h3>{preset.title}</h3>
                        <p>{preset.description}</p>
                        <ul>
                          {names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          aria-label={`使用模板 ${preset.title}`}
                          onClick={() => applyPreset(preset.promptIds)}
                        >
                          使用模板
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : (
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
                        onCopy={
                          concept.source === 'builtin'
                            ? () => openCopyDialog(concept.id)
                            : undefined
                        }
                        onEdit={
                          isManagedPrompt(concept) ? () => openEditDialog(concept.id) : undefined
                        }
                        onDelete={
                          isManagedPrompt(concept) ? () => openDeleteDialog(concept.id) : undefined
                        }
                      />
                    ))
                  ) : libraryView === 'all' &&
                    source === 'user' &&
                    !query.trim() &&
                    !categoryId &&
                    !tag ? (
                    <div className="search-empty">
                      <strong>还没有我的词条</strong>
                      <p>新建一个词条，把自己的常用灵感保存在这里。</p>
                      <button type="button" onClick={openCreateDialog}>
                        新建词条
                      </button>
                    </div>
                  ) : libraryView === 'favorites' && favoritePrompts.length === 0 ? (
                    <div className="search-empty">
                      <strong>还没有收藏{mediaType === 'image' ? '图片' : '视频'}提示词</strong>
                      <p>浏览词库并点击星标，把常用灵感保存在这里。</p>
                      <button type="button" onClick={browseAll}>
                        浏览全部灵感
                      </button>
                    </div>
                  ) : (
                    <div className="search-empty">
                      <strong>
                        {libraryView === 'favorites' ? '没有找到匹配的收藏' : '没有找到匹配的词条'}
                      </strong>
                      <p>试试名称、别名、标签、分类或英文关键词。</p>
                      <button type="button" onClick={clearCriteria}>
                        {hasActiveFilters ? '清除全部筛选' : '清除搜索'}
                      </button>
                    </div>
                  )}
                </div>
              )}
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
      {importOpen ? (
        <div className="dialog-backdrop">
          <section
            ref={importDialog}
            className="import-dialog"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="create-dialog-heading">
              <div>
                <h2 id="import-title">导入与导出</h2>
                <p>离线导入或导出 JSONL、CSV 与 PromptMate 数据包。</p>
              </div>
              <button type="button" aria-label="关闭导入与导出" onClick={closeImportDialog}>
                ×
              </button>
            </div>
            <div className="transfer-tabs" role="tablist" aria-label="导入与导出模式">
              <button
                type="button"
                role="tab"
                aria-selected={transferTab === 'import'}
                onClick={() => setTransferTab('import')}
              >
                导入
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={transferTab === 'export'}
                onClick={() => setTransferTab('export')}
              >
                导出
              </button>
            </div>
            <div className="import-content">
              {transferTab === 'import' ? (
                <>
                  <label className="import-file-field">
                    选择 JSONL、CSV 或 PromptMate 数据包
                    <input
                      ref={importInitialFocus}
                      type="file"
                      aria-label="选择 JSONL 文件"
                      accept=".jsonl,.csv,.promptmate.json,application/x-ndjson,text/csv,application/json"
                      onChange={(event) => void selectImportFile(event.currentTarget.files?.[0])}
                    />
                  </label>
                  {importPreview && importPlan ? (
                    <>
                      <label className="import-policy-field">
                        重复项处理
                        <select
                          value={importPolicy}
                          onChange={(event) =>
                            setImportPolicy(event.currentTarget.value as ImportConflictPolicy)
                          }
                        >
                          <option value="skip">跳过重复项</option>
                          <option value="replace">替换已有词条</option>
                          <option value="copy">创建副本</option>
                        </select>
                      </label>
                      <p className="import-summary">
                        共 {importPreview.summary.incomingRows} 行，
                        {importPreview.summary.errorCount} 个错误；新增 {importPlan.counts.add} ·
                        跳过 {importPlan.counts.skip} · 替换 {importPlan.counts.replace} · 副本{' '}
                        {importPlan.counts.copy} · 阻断 {importPlan.counts.blocked}；导入后共{' '}
                        {importPlan.importAfterTotal} 条
                      </p>
                      {importPlan.rows.length ? (
                        <ul className="import-preview-list" aria-label="导入预览">
                          {importPlan.rows.map((row, index) => {
                            const candidate = row.candidate
                            const candidateMedia = candidate.media_types[0] as MediaType
                            const categoryLabel = libraryCatalog[candidateMedia].categories.find(
                              ({ id }) => id === candidate.category_id,
                            )?.label
                            const targets = [
                              ...new Map(
                                row.conflicts.map(({ target }) => [
                                  `${target.scope}:${target.prompt.id}`,
                                  target,
                                ]),
                              ).values(),
                            ]
                            return (
                              <li key={`${candidate.id}-${index}`}>
                                <strong>{candidate.zh}</strong>
                                <span>{candidate.en}</span>
                                <small>
                                  {candidateMedia === 'image' ? '图片' : '视频'} · {categoryLabel} ·{' '}
                                  {sourceLabels[candidate.source]}
                                </small>
                                <span className={`import-result import-result-${row.result}`}>
                                  {importResultLabels[row.result]}
                                </span>
                                {targets.length ? (
                                  <small>
                                    冲突目标：
                                    {targets
                                      .map(
                                        ({ scope, prompt }) =>
                                          `${prompt.zh}（${
                                            scope === 'builtin'
                                              ? '内置'
                                              : scope === 'managed'
                                                ? '已有'
                                                : '本次导入'
                                          }）`,
                                      )
                                      .join('、')}
                                  </small>
                                ) : null}
                                {row.reason ? (
                                  <small>阻断原因：{importReasonLabels[row.reason]}</small>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                      {importPreview.issues.length || importPlan.blocked ? (
                        <div className="import-issues" role="alert">
                          <strong>
                            {importPreview.issues.length
                              ? '文件包含错误，修正后才能导入。'
                              : '存在无法处理的冲突，本次导入不会写入。'}
                          </strong>
                          {importPreview.issues.length ? (
                            <>
                              <ul aria-label="文件解析错误">
                                {importPreview.issues.slice(0, 100).map((issue, index) => {
                                  const position = issue.location
                                    ? issue.location
                                    : issue.line
                                      ? `第 ${issue.line} 行`
                                      : ''
                                  const field = issue.field ? `字段 ${issue.field}` : ''
                                  const prefix = [position, field].filter(Boolean).join(' · ')
                                  return (
                                    <li key={`${issue.code}-${issue.line ?? 0}-${index}`}>
                                      {prefix ? `${prefix}：` : ''}
                                      {issue.message}
                                    </li>
                                  )
                                })}
                              </ul>
                              {importPreview.issues.length > 100 ? (
                                <p>其余 {importPreview.issues.length - 100} 项请下载报告。</p>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {importError ? <p role="alert">{importError}</p> : null}
                  <div className="create-dialog-actions">
                    <button type="button" onClick={closeImportDialog}>
                      取消
                    </button>
                    {hasImportReport ? (
                      <button type="button" disabled={reportSaving} onClick={downloadImportReport}>
                        {reportSaving ? '正在保存报告…' : '下载导入报告'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        !importPreview ||
                        !importPlan ||
                        importTransactionBlocked ||
                        !importPlan.changedCount
                      }
                      onClick={applyImport}
                    >
                      确认导入 {importPlan?.changedCount ?? 0} 条
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="export-controls">
                    <label>
                      媒体范围
                      <select
                        value={exportMediaScope}
                        onChange={(event) =>
                          setExportMediaScope(event.currentTarget.value as ExportMediaScope)
                        }
                      >
                        <option value="current">当前媒体</option>
                        <option value="all">全部媒体</option>
                      </select>
                    </label>
                    <label>
                      词条来源
                      <select
                        value={exportSourceScope}
                        onChange={(event) =>
                          setExportSourceScope(event.currentTarget.value as ExportSourceScope)
                        }
                      >
                        <option value="all">全部词条</option>
                        <option value="user">我的词条</option>
                        <option value="imported">社区导入</option>
                      </select>
                    </label>
                    <label>
                      导出格式
                      <select
                        value={exportFormat}
                        onChange={(event) =>
                          setExportFormat(event.currentTarget.value as 'jsonl' | 'package' | 'csv')
                        }
                      >
                        <option value="jsonl">JSONL</option>
                        <option value="csv">CSV</option>
                        <option value="package">PromptMate 数据包</option>
                      </select>
                    </label>
                  </div>
                  {exportPrompts.length ? (
                    <p className="import-summary">将导出 {exportPrompts.length} 条词条</p>
                  ) : (
                    <p className="export-empty">当前范围没有可导出的词条。</p>
                  )}
                  {exportFeedback ? <p role="status">{exportFeedback}</p> : null}
                  {exportError ? <p role="alert">{exportError}</p> : null}
                  <div className="create-dialog-actions">
                    <button type="button" onClick={closeImportDialog}>
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={!exportPrompts.length || exportSaving}
                      onClick={downloadExport}
                    >
                      {exportSaving ? '正在保存…' : `下载 ${exportPrompts.length} 条词条`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {createOpen ? (
        <div className="dialog-backdrop">
          <section
            ref={createDialog}
            className="create-dialog"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <div className="create-dialog-heading">
              <div>
                <h2 id="create-title">
                  {copyingPromptId ? '复制并编辑词条' : editingPromptId ? '编辑词条' : '新建词条'}
                </h2>
                <p>当前媒体：{mediaType === 'image' ? '图片' : '视频'}</p>
              </div>
              <button
                type="button"
                aria-label={`关闭${copyingPromptId ? '复制并编辑词条' : editingPromptId ? '编辑词条' : '新建词条'}`}
                onClick={closeCreateDialog}
              >
                ×
              </button>
            </div>
            <form className="create-prompt-form" onSubmit={submitCreatePrompt}>
              <label>
                中文名称
                <input
                  ref={createInitialFocus}
                  value={createDraft.zh}
                  onChange={(event) => updateCreateDraft('zh', event.target.value)}
                />
              </label>
              <label>
                英文名称
                <input
                  value={createDraft.en}
                  onChange={(event) => updateCreateDraft('en', event.target.value)}
                />
              </label>
              <label>
                中文描述（可选）
                <textarea
                  value={createDraft.descriptionZh}
                  onChange={(event) => updateCreateDraft('descriptionZh', event.target.value)}
                />
              </label>
              <label>
                英文描述（可选）
                <textarea
                  value={createDraft.descriptionEn}
                  onChange={(event) => updateCreateDraft('descriptionEn', event.target.value)}
                />
              </label>
              <label>
                分类
                <select
                  value={createDraft.categoryId}
                  onChange={(event) => updateCreateDraft('categoryId', event.target.value)}
                >
                  <option value="">请选择分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标签（可选）
                <input
                  value={createDraft.tags}
                  onChange={(event) => updateCreateDraft('tags', event.target.value)}
                />
              </label>
              <label>
                中文别名（可选）
                <input
                  value={createDraft.aliasesZh}
                  onChange={(event) => updateCreateDraft('aliasesZh', event.target.value)}
                />
              </label>
              <label>
                英文别名（可选）
                <input
                  value={createDraft.aliasesEn}
                  onChange={(event) => updateCreateDraft('aliasesEn', event.target.value)}
                />
              </label>
              {createError ? <p role="alert">{createError}</p> : null}
              <div className="create-dialog-actions">
                <button type="button" onClick={closeCreateDialog}>
                  取消
                </button>
                <button type="submit">
                  {copyingPromptId ? '保存到我的词条' : editingPromptId ? '保存修改' : '创建词条'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="dialog-backdrop">
          <section
            ref={deleteDialog}
            className="delete-dialog"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">删除词条</h2>
            <p>确定要删除“{deleteTarget.zh}”吗？</p>
            <p className="delete-dialog-note">
              删除后会同时从收藏、灵感篮和相关最近使用记录中移除。
            </p>
            <div className="delete-dialog-actions">
              <button
                ref={deleteInitialFocus}
                type="button"
                onClick={() => setDeletePromptId(null)}
              >
                取消
              </button>
              <button type="button" className="destructive-action" onClick={confirmDeletePrompt}>
                确认删除 {deleteTarget.zh}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
