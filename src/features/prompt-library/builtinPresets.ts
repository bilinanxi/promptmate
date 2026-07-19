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
    {
      id: 'soft-fashion-portrait',
      mediaType: 'image',
      title: '柔光时尚人像',
      description: '以长发、微笑、连衣裙和轮廓光快速组合柔和半身人像。',
      promptIds: ['long-hair', 'smile', 'dress', 'rim-light-fb0e5ab0', 'medium-close'],
    },
    {
      id: 'cyberpunk-rain-city',
      mediaType: 'image',
      title: '赛博朋克雨城',
      description: '组合赛博朋克风格、霓虹灯、雨天和城市环境。',
      promptIds: ['cyberpunk', 'glowing-neon-lights', 'rainy-days', 'city'],
    },
    {
      id: 'spring-hanfu',
      mediaType: 'image',
      title: '春日汉服',
      description: '用浅绿上杉、百褶裙与樱花构成清新的汉服人物场景。',
      promptIds: ['hanfu', 'light-green-upper-shan', 'pleated-skirt', 'cherry-blossoms'],
    },
    {
      id: 'golden-ink-courtyard',
      mediaType: 'image',
      title: '金色水墨庭院',
      description: '将水墨画、东方庭院、留白和黄金时段光线组合为传统意境画面。',
      promptIds: [
        'ink-wash-painting',
        'chinese-courtyard',
        'negative-space',
        'golden-hour-lighting',
      ],
    },
    {
      id: 'cinematic-starry-traveler',
      mediaType: 'image',
      title: '星夜旅人',
      description: '利用星空、电影级光照、孤独旅人和回眸动作营造夜间叙事。',
      promptIds: ['starry-sky', 'cinematic-lighting', 'solitary-traveler', 'look-back'],
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
