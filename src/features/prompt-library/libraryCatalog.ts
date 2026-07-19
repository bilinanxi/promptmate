import type { MediaType } from './types'

export interface LibraryCategory {
  id: string
  label: string
}

export const libraryCatalog: Record<MediaType, { categories: LibraryCategory[]; tags: string[] }> =
  {
    image: {
      categories: [
        { id: 'people-subjects', label: '人物主体' },
        { id: 'clothing-accessories', label: '服装配饰' },
        { id: 'action-pose', label: '动作姿态' },
        { id: 'expression-emotion', label: '表情与情绪' },
        { id: 'scene-environment', label: '场景环境' },
        { id: 'objects-props', label: '物品与道具' },
        { id: 'lighting-atmosphere', label: '灯光氛围' },
        { id: 'camera-composition', label: '镜头构图' },
        { id: 'visual-style', label: '艺术风格' },
        { id: 'quality-effects', label: '画质与特效' },
        { id: 'negative-prompt', label: '负面提示词' },
      ],
      tags: [
        '新手友好',
        '人像',
        '电影感',
        '东方美学',
        '自然',
        '商业',
        '成人向',
        '截图整理',
        'YouMind整理',
      ],
    },
    video: {
      categories: [
        { id: 'camera-movement', label: '镜头运动' },
        { id: 'subject-motion', label: '主体运动' },
        { id: 'time-transition', label: '时间与转场' },
        { id: 'motion-atmosphere', label: '动态氛围' },
      ],
      tags: ['运镜', '电影感', '人物', '转场', '自然', '商业'],
    },
  }

export const knownCategoryIds: Record<MediaType, ReadonlySet<string>> = {
  image: new Set(libraryCatalog.image.categories.map(({ id }) => id)),
  video: new Set(libraryCatalog.video.categories.map(({ id }) => id)),
}
