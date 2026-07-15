import { describe, expect, it } from 'vitest'
import {
  addRecentUsage,
  loadRecentUsage,
  MAX_RECENT_USAGE,
  RECENT_USAGE_STORAGE_KEY,
  saveRecentUsage,
  type RecentUsageRecord,
} from './recentUsageStorage'

const knownPromptIds = {
  image: new Set(['young-woman', 'rim-light']),
  video: new Set(['slow-push-in']),
}

describe('recent usage storage', () => {
  it('loads a valid versioned record without changing exact copied text or prompt order', () => {
    const exactText = '  年轻女性\n rim light  '
    let requestedKey = ''
    const storage = {
      getItem: (key: string) => {
        requestedKey = key
        return JSON.stringify({
          version: 1,
          records: [
            {
              id: 'recent-1',
              mediaType: 'image',
              promptIds: ['rim-light', 'young-woman'],
              language: 'zh',
              copiedText: exactText,
              usedAt: 1721044800000,
            },
          ],
        })
      },
    }

    expect(loadRecentUsage(storage, knownPromptIds)).toEqual([
      {
        id: 'recent-1',
        mediaType: 'image',
        promptIds: ['rim-light', 'young-woman'],
        language: 'zh',
        copiedText: exactText,
        usedAt: 1721044800000,
      },
    ])
    expect(requestedKey).toBe(RECENT_USAGE_STORAGE_KEY)
  })

  it('normalizes persisted records to newest-first order', () => {
    const records = [
      {
        id: 'older',
        mediaType: 'image',
        promptIds: ['young-woman'],
        language: 'zh',
        copiedText: 'older',
        usedAt: 100,
      },
      {
        id: 'newer',
        mediaType: 'video',
        promptIds: ['slow-push-in'],
        language: 'en',
        copiedText: 'newer',
        usedAt: 200,
      },
    ]
    const storage = { getItem: () => JSON.stringify({ version: 1, records }) }

    expect(loadRecentUsage(storage, knownPromptIds).map(({ id }) => id)).toEqual(['newer', 'older'])
  })

  it('rejects malformed, unsupported, duplicated, unknown, and invalid persisted data safely', () => {
    const valid: RecentUsageRecord = {
      id: 'valid',
      mediaType: 'image',
      promptIds: ['young-woman'],
      language: 'zh',
      copiedText: '年轻女性。',
      usedAt: 100,
    }
    const invalidPayloads: unknown[] = [
      '{bad json',
      null,
      { version: 2, records: [] },
      { version: 1, records: [valid, { ...valid }] },
      { version: 1, records: [{ ...valid, promptIds: ['missing'] }] },
      { version: 1, records: [{ ...valid, mediaType: 'audio' }] },
      { version: 1, records: [{ ...valid, promptIds: ['young-woman', 'young-woman'] }] },
      { version: 1, records: [{ ...valid, language: 'fr' }] },
      { version: 1, records: [{ ...valid, copiedText: '  ' }] },
      { version: 1, records: [{ ...valid, usedAt: 'yesterday' }] },
      { version: 1, records: [{ ...valid, usedAt: Date.now() + 60_000 }] },
      { version: 1, records: [{ ...valid, usedAt: 8_640_000_000_000_001 }] },
    ]

    for (const payload of invalidPayloads) {
      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)
      expect(loadRecentUsage({ getItem: () => serialized }, knownPromptIds)).toEqual([])
    }
    expect(
      loadRecentUsage(
        {
          getItem: () => {
            throw new Error('blocked')
          },
        },
        knownPromptIds,
      ),
    ).toEqual([])
  })

  it('moves an exact duplicate to newest, preserves its stable id, and caps the list', () => {
    const records: RecentUsageRecord[] = Array.from({ length: MAX_RECENT_USAGE }, (_, index) => ({
      id: `record-${index}`,
      mediaType: 'image',
      promptIds: ['young-woman'],
      language: 'zh',
      copiedText: `text-${index}`,
      usedAt: 100 - index,
    }))
    const duplicate = { ...records[5], id: 'discard-this-id', usedAt: 999 }

    const updated = addRecentUsage(records, duplicate)

    expect(updated).toHaveLength(MAX_RECENT_USAGE)
    expect(updated[0]).toEqual({ ...duplicate, id: 'record-5' })
    expect(updated.filter(({ copiedText }) => copiedText === duplicate.copiedText)).toHaveLength(1)

    const capped = addRecentUsage(records, {
      ...records[0],
      id: 'brand-new',
      copiedText: 'brand-new',
      usedAt: 1000,
    })
    expect(capped).toHaveLength(MAX_RECENT_USAGE)
    expect(capped.some(({ id }) => id === 'record-11')).toBe(false)
  })

  it('reports write failure without throwing and serializes a versioned payload on success', () => {
    let serialized = ''
    const record: RecentUsageRecord = {
      id: 'record-1',
      mediaType: 'video',
      promptIds: ['slow-push-in'],
      language: 'en',
      copiedText: 'slow push in.',
      usedAt: 100,
    }

    expect(
      saveRecentUsage(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        [record],
      ),
    ).toBe(false)
    expect(
      saveRecentUsage(
        {
          setItem: (key, value) => {
            expect(key).toBe(RECENT_USAGE_STORAGE_KEY)
            serialized = value
          },
        },
        [record],
      ),
    ).toBe(true)
    expect(JSON.parse(serialized)).toEqual({ version: 1, records: [record] })
  })
})
