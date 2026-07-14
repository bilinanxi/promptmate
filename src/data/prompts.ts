export type PromptSource = 'builtin' | 'user' | 'imported' | 'ai_generated'

export interface PromptConcept {
  id: string
  zh: string
  en: string
  category: string
  description: string
  source: PromptSource
}

export const promptConcepts: PromptConcept[] = [
  {
    id: 'young-woman',
    zh: '年轻女性',
    en: 'young woman',
    category: '人物主体',
    description: '适合人像、时尚和叙事画面的通用主体。',
    source: 'builtin',
  },
  {
    id: 'solitary-traveler',
    zh: '独行旅人',
    en: 'solitary traveler',
    category: '人物主体',
    description: '给风景加入人物尺度和故事感。',
    source: 'builtin',
  },
  {
    id: 'neon-rain',
    zh: '霓虹雨夜街道',
    en: 'neon-lit rainy street',
    category: '场景环境',
    description: '蓝紫霓虹映在湿润路面，营造强烈电影氛围。',
    source: 'imported',
  },
  {
    id: 'chinese-courtyard',
    zh: '静谧中式庭院',
    en: 'serene Chinese courtyard',
    category: '场景环境',
    description: '白墙黛瓦、植物与留白构成安静空间。',
    source: 'builtin',
  },
  {
    id: 'look-back',
    zh: '行走中回眸',
    en: 'looking back while walking',
    category: '动作姿态',
    description: '比静态站姿更有叙事和瞬间感。',
    source: 'builtin',
  },
  {
    id: 'white-dress',
    zh: '飘逸白色长裙',
    en: 'flowing white dress',
    category: '服装配饰',
    description: '轮廓轻盈，适合自然、梦幻与电影风格。',
    source: 'builtin',
  },
  {
    id: 'rim-light',
    zh: '柔和侧逆光',
    en: 'soft rim lighting',
    category: '灯光氛围',
    description: '勾勒主体轮廓，让人物从背景中分离。',
    source: 'builtin',
  },
  {
    id: 'volumetric',
    zh: '薄雾体积光',
    en: 'volumetric light through mist',
    category: '灯光氛围',
    description: '光线在雾气中形成可见层次。',
    source: 'imported',
  },
  {
    id: 'medium-close',
    zh: '中近景',
    en: 'medium close-up',
    category: '镜头构图',
    description: '兼顾人物表情与少量环境信息。',
    source: 'builtin',
  },
  {
    id: 'negative-space',
    zh: '留白构图',
    en: 'negative space composition',
    category: '镜头构图',
    description: '减少干扰，为主体和文字预留呼吸空间。',
    source: 'builtin',
  },
  {
    id: 'cinematic',
    zh: '克制的电影感',
    en: 'restrained cinematic style',
    category: '艺术风格',
    description: '不过度调色，以光影和构图建立叙事。',
    source: 'user',
  },
  {
    id: 'ink-wash',
    zh: '当代水墨气质',
    en: 'contemporary ink-wash aesthetic',
    category: '艺术风格',
    description: '保留水墨留白与层叠，同时避免古旧感。',
    source: 'ai_generated',
  },
]
