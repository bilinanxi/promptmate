import type { MediaType } from './types'

export interface BuiltinPreset {
  id: string
  mediaType: MediaType
  title: string
  description: string
  promptIds: readonly string[]
}

export const builtinPresetsByMedia = {
  image: [
    {
      id: 'cinematic-portrait',
      mediaType: 'image',
      title: '电影感人像',
      description: '快速建立主体、轮廓光、景别与克制电影质感。',
      promptIds: ['young-woman', 'rim-light', 'medium-close', 'cinematic'],
    },
    {
      id: 'eastern-courtyard',
      mediaType: 'image',
      title: '东方庭院',
      description: '适合安静、留白充足的东方建筑与氛围画面。',
      promptIds: ['chinese-courtyard', 'volumetric', 'negative-space', 'ink-wash'],
    },
    {
      id: 'rainy-traveler',
      mediaType: 'image',
      title: '雨夜旅人',
      description: '用雨夜、回眸动作和电影风格构成叙事瞬间。',
      promptIds: ['solitary-traveler', 'neon-rain', 'look-back', 'cinematic'],
    },
  ],
  video: [
    {
      id: 'character-entrance',
      mediaType: 'video',
      title: '角色入场',
      description: '以推进、前行和细微环境运动完成自然人物出场。',
      promptIds: ['slow-push-in', 'walking-forward', 'fabric-in-breeze', 'floating-dust'],
    },
    {
      id: 'time-transition',
      mediaType: 'video',
      title: '时间流转',
      description: '结合环绕镜头、昼夜变化与遮挡转场表现时间推进。',
      promptIds: ['smooth-orbit', 'day-to-night', 'foreground-wipe', 'cinematic-rain-motion'],
    },
  ],
} as const satisfies Record<MediaType, readonly BuiltinPreset[]>
