import type { MediaType } from './types'

export const FAVORITES_STORAGE_KEY = 'promptmate:favorites'

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter {
  setItem(key: string, value: string): void
}

interface StoredFavorite {
  mediaType: MediaType
  promptId: string
}

interface StoredFavorites {
  version: 1
  favorites: StoredFavorite[]
}

export function makeFavoriteKey(mediaType: MediaType, promptId: string) {
  return `${mediaType}:${promptId}`
}

function isStoredFavorite(value: unknown): value is StoredFavorite {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).length === 2 &&
    (entry.mediaType === 'image' || entry.mediaType === 'video') &&
    typeof entry.promptId === 'string' &&
    entry.promptId.length > 0
  )
}

export function loadFavoriteKeys(storage: StorageReader, knownKeys: ReadonlySet<string>): string[] {
  try {
    const serialized = storage.getItem(FAVORITES_STORAGE_KEY)
    if (serialized === null) return []
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const payload = value as Record<string, unknown>
    if (
      Object.keys(payload).length !== 2 ||
      payload.version !== 1 ||
      !Array.isArray(payload.favorites) ||
      !payload.favorites.every(isStoredFavorite)
    ) {
      return []
    }
    const keys = payload.favorites.map(({ mediaType, promptId }) =>
      makeFavoriteKey(mediaType, promptId),
    )
    if (new Set(keys).size !== keys.length || keys.some((key) => !knownKeys.has(key))) return []
    return keys
  } catch {
    return []
  }
}

export function saveFavoriteKeys(storage: StorageWriter, keys: readonly string[]): boolean {
  const favorites: StoredFavorite[] = []
  for (const key of keys) {
    const separator = key.indexOf(':')
    const mediaType = key.slice(0, separator)
    const promptId = key.slice(separator + 1)
    if ((mediaType !== 'image' && mediaType !== 'video') || !promptId) return false
    favorites.push({ mediaType, promptId })
  }
  const payload: StoredFavorites = { version: 1, favorites }
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
