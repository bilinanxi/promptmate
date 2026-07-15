import type { MediaType } from './types'

export const RECENT_USAGE_STORAGE_KEY = 'promptmate:recent-usage'
export const MAX_RECENT_USAGE = 12
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000

export interface RecentUsageRecord {
  id: string
  mediaType: MediaType
  promptIds: string[]
  language: 'zh' | 'en'
  copiedText: string
  usedAt: number
}

type KnownPromptIds = Record<MediaType, ReadonlySet<string>>

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter {
  setItem(key: string, value: string): void
}

function isRecord(value: unknown, knownPromptIds: KnownPromptIds): value is RecentUsageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 6 ||
    typeof record.id !== 'string' ||
    !record.id ||
    (record.mediaType !== 'image' && record.mediaType !== 'video') ||
    !Array.isArray(record.promptIds) ||
    !record.promptIds.length ||
    !record.promptIds.every((id): id is string => typeof id === 'string') ||
    new Set(record.promptIds).size !== record.promptIds.length ||
    (record.language !== 'zh' && record.language !== 'en') ||
    typeof record.copiedText !== 'string' ||
    !record.copiedText.trim() ||
    typeof record.usedAt !== 'number' ||
    !Number.isInteger(record.usedAt) ||
    record.usedAt < 0 ||
    record.usedAt > MAX_DATE_TIMESTAMP ||
    record.usedAt > Date.now()
  ) {
    return false
  }
  return record.promptIds.every((id) => knownPromptIds[record.mediaType as MediaType].has(id))
}

export function loadRecentUsage(
  storage: StorageReader,
  knownPromptIds: KnownPromptIds,
): RecentUsageRecord[] {
  try {
    const serialized = storage.getItem(RECENT_USAGE_STORAGE_KEY)
    if (serialized === null) return []
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const payload = value as Record<string, unknown>
    if (
      Object.keys(payload).length !== 2 ||
      payload.version !== 1 ||
      !Array.isArray(payload.records) ||
      payload.records.length > MAX_RECENT_USAGE ||
      !payload.records.every((record) => isRecord(record, knownPromptIds))
    ) {
      return []
    }
    const records = payload.records as RecentUsageRecord[]
    if (new Set(records.map(({ id }) => id)).size !== records.length) return []
    return [...records].sort((left, right) => right.usedAt - left.usedAt)
  } catch {
    return []
  }
}

export function saveRecentUsage(storage: StorageWriter, records: readonly RecentUsageRecord[]) {
  try {
    storage.setItem(RECENT_USAGE_STORAGE_KEY, JSON.stringify({ version: 1, records }))
    return true
  } catch {
    return false
  }
}

export function addRecentUsage(
  records: readonly RecentUsageRecord[],
  incoming: RecentUsageRecord,
): RecentUsageRecord[] {
  const duplicate = records.find(
    (record) =>
      record.mediaType === incoming.mediaType &&
      record.language === incoming.language &&
      record.copiedText === incoming.copiedText &&
      record.promptIds.length === incoming.promptIds.length &&
      record.promptIds.every((id, index) => id === incoming.promptIds[index]),
  )
  const newest = duplicate ? { ...incoming, id: duplicate.id } : incoming
  return [newest, ...records.filter((record) => record.id !== duplicate?.id)].slice(
    0,
    MAX_RECENT_USAGE,
  )
}
