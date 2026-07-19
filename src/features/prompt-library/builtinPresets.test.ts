import { describe, expect, it } from 'vitest'
import { builtinPromptsByMedia } from './builtinPrompts'
import { builtinPresetsByMedia } from './builtinPresets'

const expectedPresetIds = {
  image: [
    ['young-woman', 'rim-light', 'medium-close', 'cinematic'],
    ['chinese-courtyard', 'volumetric', 'negative-space', 'ink-wash'],
    ['solitary-traveler', 'neon-rain', 'look-back', 'cinematic'],
    ['long-hair', 'smile', 'dress', 'rim-light-fb0e5ab0', 'medium-close'],
    ['cyberpunk', 'glowing-neon-lights', 'rainy-days', 'city'],
    ['hanfu', 'light-green-upper-shan', 'pleated-skirt', 'cherry-blossoms'],
    ['ink-wash-painting', 'chinese-courtyard', 'negative-space', 'golden-hour-lighting'],
    ['starry-sky', 'cinematic-lighting', 'solitary-traveler', 'look-back'],
  ],
  video: [
    ['slow-push-in', 'walking-forward', 'fabric-in-breeze', 'floating-dust'],
    ['smooth-orbit', 'day-to-night', 'foreground-wipe', 'cinematic-rain-motion'],
  ],
} as const

describe('built-in prompt presets', () => {
  it('defines the project-owned presets in intentional order with real active-media IDs', () => {
    for (const mediaType of ['image', 'video'] as const) {
      const knownIds = new Set(builtinPromptsByMedia[mediaType].map(({ id }) => id))
      expect(builtinPresetsByMedia[mediaType].map(({ promptIds }) => promptIds)).toEqual(
        expectedPresetIds[mediaType],
      )
      for (const preset of builtinPresetsByMedia[mediaType]) {
        expect(preset.mediaType).toBe(mediaType)
        expect(preset.id).toBeTruthy()
        expect(preset.title).toBeTruthy()
        expect(preset.description).toBeTruthy()
        expect(new Set(preset.promptIds).size).toBe(preset.promptIds.length)
        expect(preset.promptIds.every((id) => knownIds.has(id))).toBe(true)
      }
    }
  })
})
