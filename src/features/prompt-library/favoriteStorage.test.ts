import { describe, expect, it, vi } from 'vitest'
import {
  FAVORITES_STORAGE_KEY,
  loadFavoriteKeys,
  makeFavoriteKey,
  saveFavoriteKeys,
} from './favoriteStorage'

const knownKeys = new Set([
  makeFavoriteKey('image', 'shared-id'),
  makeFavoriteKey('video', 'shared-id'),
])

describe('favorite identity', () => {
  it('includes media type so equal prompt ids remain isolated', () => {
    expect(makeFavoriteKey('image', 'shared-id')).not.toBe(makeFavoriteKey('video', 'shared-id'))
  })
})

describe('favorite storage', () => {
  it.each([
    ['malformed JSON', '{'],
    ['wrong root shape', '[]'],
    ['unsupported version', JSON.stringify({ version: 2, favorites: [] })],
    ['wrong favorites shape', JSON.stringify({ version: 1, favorites: 'image:shared-id' })],
    [
      'unknown media',
      JSON.stringify({ version: 1, favorites: [{ mediaType: 'audio', promptId: 'shared-id' }] }),
    ],
    [
      'duplicate favorite',
      JSON.stringify({
        version: 1,
        favorites: [
          { mediaType: 'image', promptId: 'shared-id' },
          { mediaType: 'image', promptId: 'shared-id' },
        ],
      }),
    ],
    [
      'favorite with an extra field',
      JSON.stringify({
        version: 1,
        favorites: [{ mediaType: 'image', promptId: 'shared-id', label: 'unexpected' }],
      }),
    ],
    [
      'empty prompt id',
      JSON.stringify({ version: 1, favorites: [{ mediaType: 'image', promptId: '' }] }),
    ],
    [
      'unknown prompt',
      JSON.stringify({ version: 1, favorites: [{ mediaType: 'image', promptId: 'missing' }] }),
    ],
  ])('fails closed for %s', (_label, storedValue) => {
    const storage = { getItem: vi.fn(() => storedValue) }

    expect(loadFavoriteKeys(storage, knownKeys)).toEqual([])
  })

  it('round-trips a versioned per-media payload', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(
      saveFavoriteKeys(storage, [
        makeFavoriteKey('image', 'shared-id'),
        makeFavoriteKey('video', 'shared-id'),
      ]),
    ).toBe(true)
    expect(JSON.parse(values.get(FAVORITES_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      favorites: [
        { mediaType: 'image', promptId: 'shared-id' },
        { mediaType: 'video', promptId: 'shared-id' },
      ],
    })
    expect(loadFavoriteKeys(storage, knownKeys)).toEqual([
      makeFavoriteKey('image', 'shared-id'),
      makeFavoriteKey('video', 'shared-id'),
    ])
  })

  it('returns safe defaults when storage reads or writes throw', () => {
    expect(
      loadFavoriteKeys(
        {
          getItem: () => {
            throw new Error('blocked')
          },
        },
        knownKeys,
      ),
    ).toEqual([])
    expect(
      saveFavoriteKeys(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        [makeFavoriteKey('image', 'shared-id')],
      ),
    ).toBe(false)
  })
})
