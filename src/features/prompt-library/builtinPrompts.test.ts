import { describe, expect, it } from 'vitest'
import { searchPrompts } from './searchPrompts'
import { builtinPrompts } from './builtinPrompts'
import { libraryCatalog } from './libraryCatalog'

const expandedImageCategoryIds = [
  'people-subjects',
  'clothing-accessories',
  'action-pose',
  'expression-emotion',
  'scene-environment',
  'objects-props',
  'lighting-atmosphere',
  'camera-composition',
  'visual-style',
  'quality-effects',
  'negative-prompt',
]

const cssColorTranslations: Record<string, string> = {
  skyblue: '天蓝色',
  lightblue: '浅蓝色',
  powderblue: '粉蓝色',
  aquamarine: '碧绿色',
  turquoise: '绿松石色',
  mediumturquoise: '中绿松石色',
  paleturquoise: '淡绿松石色',
  lightcyan: '淡青色',
  cyan: '青色',
  darkturquoise: '深绿松石色',
  lightseagreen: '浅海绿色',
  cadetblue: '军服蓝色',
  darkcyan: '深青色',
  seagreen: '海绿色',
  mediumseagreen: '中海绿色',
  mediumaquamarine: '中碧绿色',
  teal: '水鸭色',
  darkslategray: '暗石板灰',
  darkgreen: '深绿色',
  green: '绿色',
  forestgreen: '森林绿色',
  palegreen: '淡绿色',
  lightgreen: '浅绿色',
  springgreen: '春绿色',
  mediumspringgreen: '中春绿色',
  lawngreen: '草坪绿色',
  chartreuse: '查特酒绿色',
  greenyellow: '绿黄色',
  lime: '酸橙色',
  limegreen: '酸橙绿色',
  darkolivegreen: '暗橄榄绿色',
  yellowgreen: '黄绿色',
}

describe('builtinPrompts', () => {
  it('loads the expanded validated image prompt library', () => {
    expect(builtinPrompts).toHaveLength(3159)
    expect(new Set(builtinPrompts.map(({ id }) => id)).size).toBe(3159)
    expect(
      new Set(builtinPrompts.map(({ zh }) => zh.normalize('NFKC').replaceAll(/\s/g, ''))).size,
    ).toBe(3159)
    expect(new Set(builtinPrompts.map(({ en }) => en.normalize('NFKC').toLowerCase())).size).toBe(
      3159,
    )
  })

  it('uses normalized English slugs for screenshot-curated IDs', () => {
    for (const { id, en, tags } of builtinPrompts) {
      if (!tags.includes('截图整理') || id === 'rim-light-fb0e5ab0') continue
      const expectedId = en
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      expect(id, en).toBe(expectedId)
    }
  })

  it('keeps the imported CSS color sequence bilingually aligned', () => {
    for (const [id, zh] of Object.entries(cssColorTranslations)) {
      expect(
        builtinPrompts.find((prompt) => prompt.id === id),
        id,
      ).toMatchObject({ id, zh, en: id })
    }
  })

  it('registers every curated image category in the catalog', () => {
    const catalogIds = libraryCatalog.image.categories.map(({ id }) => id)
    expect(catalogIds).toEqual(expect.arrayContaining(expandedImageCategoryIds))
    expect(new Set(builtinPrompts.map(({ category_id }) => category_id))).toEqual(
      new Set(expandedImageCategoryIds),
    )
  })

  it('keeps sensitive inspiration in semantic categories instead of an R18 silo', () => {
    expect(builtinPrompts.some(({ category_id }) => category_id === 'adult-r18')).toBe(false)
    expect(builtinPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dominatrix', category_id: 'people-subjects' }),
        expect.objectContaining({ id: 'between-breasts', category_id: 'people-subjects' }),
        expect.objectContaining({ id: 'areola', category_id: 'people-subjects' }),
        expect.objectContaining({ id: 'babydoll', category_id: 'clothing-accessories' }),
        expect.objectContaining({ id: 'crotchless-pants', category_id: 'clothing-accessories' }),
        expect.objectContaining({ id: 'double-ended-dildo', category_id: 'objects-props' }),
        expect.objectContaining({ id: 'holding-condom', category_id: 'objects-props' }),
        expect.objectContaining({ id: 'french-kiss', category_id: 'action-pose' }),
        expect.objectContaining({ id: 'undressing', category_id: 'action-pose' }),
        expect.objectContaining({ id: 'ass-focus', category_id: 'camera-composition' }),
        expect.objectContaining({ id: 'hip-focus', category_id: 'camera-composition' }),
        expect.objectContaining({ id: 'censorship-bar', category_id: 'quality-effects' }),
      ]),
    )
    expect(searchPrompts(builtinPrompts, '双头假阴茎').map(({ id }) => id)).toContain(
      'double-ended-dildo',
    )
  })

  it('retains screenshot concepts across sensitive and ordinary semantic categories', () => {
    const byId = new Map(builtinPrompts.map((prompt) => [prompt.id, prompt]))
    const expected = [
      ['1girl', 'people-subjects'],
      ['school-uniform', 'clothing-accessories'],
      ['pravda-military-uniform', 'clothing-accessories'],
      ['legwear', 'clothing-accessories'],
      ['gag', 'people-subjects'],
      ['wardrobe-malfunction', 'clothing-accessories'],
      ['public-indecency', 'action-pose'],
      ['playground', 'scene-environment'],
      ['classroom', 'scene-environment'],
      ['upskirt', 'camera-composition'],
      ['hand-on-another-s-chest', 'action-pose'],
      ['guro', 'visual-style'],
      ['sunlight-angel-with-wings-and-halo', 'quality-effects'],
    ] as const

    for (const [id, category_id] of expected) {
      expect(byId.get(id), id).toMatchObject({ id, category_id })
    }
  })

  it('adds curated short concepts inspired by the YouMind prompt reference library', () => {
    const youMindEntries = builtinPrompts.filter(({ tags }) => tags.includes('YouMind整理'))

    expect(youMindEntries).toHaveLength(80)
    expect(youMindEntries.every(({ source }) => source === 'builtin')).toBe(true)
    expect(youMindEntries.some(({ category_id }) => category_id === 'adult-r18')).toBe(false)
    expect(youMindEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'multi-layer-paper-relief',
          zh: '多层纸雕浮雕',
          category_id: 'visual-style',
        }),
        expect.objectContaining({
          id: 'holographic-architectural-blueprint',
          zh: '全息建筑蓝图',
          category_id: 'quality-effects',
        }),
        expect.objectContaining({
          id: 'nine-panel-storyboard-grid',
          zh: '九宫格故事板',
          category_id: 'camera-composition',
        }),
        expect.objectContaining({
          id: 'editorial-background',
          zh: '编辑风背景',
          en: 'editorial background',
          category_id: 'scene-environment',
        }),
      ]),
    )
    expect(searchPrompts(builtinPrompts, 'YouMind整理 多层纸雕').map(({ id }) => id)).toContain(
      'multi-layer-paper-relief',
    )
  })

  it('keeps representative concepts in their semantic categories with aligned translations', () => {
    const byId = new Map(builtinPrompts.map((prompt) => [prompt.id, prompt]))
    const expected = {
      laughing: { category_id: 'expression-emotion' },
      smile: { category_id: 'expression-emotion' },
      crying: { category_id: 'expression-emotion' },
      sad: { category_id: 'expression-emotion' },
      embarrassed: { category_id: 'expression-emotion' },
      sitting: { category_id: 'action-pose' },
      'lotus-position': { zh: '莲花坐姿', category_id: 'action-pose' },
      cushion: { category_id: 'objects-props' },
      kneeling: { category_id: 'action-pose' },
      'high-kick': { category_id: 'action-pose' },
      'knees-to-chest': { category_id: 'action-pose' },
      squatting: { category_id: 'action-pose' },
      'legs-apart': { category_id: 'action-pose' },
      'imminent-kiss': { category_id: 'action-pose' },
      slapping: { zh: '掌掴', category_id: 'action-pose' },
      'leg-hair': { category_id: 'people-subjects' },
      'mechanical-legs': { category_id: 'people-subjects' },
      'k-da-league-of-legends': { category_id: 'people-subjects' },
      'phone-screen': { category_id: 'objects-props' },
      'turn-one-s-back': { category_id: 'action-pose' },
      'slight-sideways-glance': { zh: '轻微侧目', category_id: 'expression-emotion' },
      'shaded-face': { zh: '脸部阴影', category_id: 'lighting-atmosphere' },
      'in-the-ocean': { zh: '在海洋中', category_id: 'scene-environment' },
      'industrial-style-chinese-architecture': {
        zh: '工业风中式建筑',
        en: 'industrial-style Chinese architecture',
        category_id: 'scene-environment',
      },
      caught: { category_id: 'action-pose' },
      'winged-angel-in-sunlight': { category_id: 'people-subjects' },
      'mecha-clothes-robot-woman': { category_id: 'people-subjects' },
      'symmetrical-docking': { category_id: 'action-pose' },
      'sitting-on-desk': { category_id: 'action-pose' },
      'torn-legwear': {
        zh: '破损的裤袜',
        en: 'torn legwear',
        category_id: 'clothing-accessories',
      },
      'narrowed-eyes': {
        zh: '眯起眼睛',
        en: 'narrowed eyes',
        category_id: 'expression-emotion',
      },
    } as const

    for (const [id, partial] of Object.entries(expected)) {
      expect(byId.get(id), id).toMatchObject({ id, ...partial })
    }
  })

  it('keeps Lolita fashion terms in the clothing category', () => {
    const lolitaEntries = builtinPrompts.filter(({ en }) => en.toLowerCase().includes('lolita'))

    expect(lolitaEntries).toHaveLength(3)
    expect(lolitaEntries.every(({ category_id }) => category_id === 'clothing-accessories')).toBe(
      true,
    )
  })

  it('rejects truncated screenshot rows and unresolved placeholder concepts', () => {
    for (const {
      id,
      zh,
      en,
      description_zh,
      description_en,
      aliases_zh,
      aliases_en,
    } of builtinPrompts) {
      expect(zh).not.toMatch(/(?:\.\.|…\s*)$/)
      expect(zh).not.toMatch(/\.\s*$/)
      expect(zh).not.toContain('|')
      for (const value of [zh, en, description_zh, description_en, ...aliases_zh, ...aliases_en]) {
        expect(value.match(/\(/g) ?? []).toHaveLength((value.match(/\)/g) ?? []).length)
        expect(value.match(/（/g) ?? []).toHaveLength((value.match(/）/g) ?? []).length)
        expect(value.match(/\[/g) ?? []).toHaveLength((value.match(/\]/g) ?? []).length)
      }
      expect(en.toLowerCase()).not.toMatch(/\bxx\b/)
      expect(en.toLowerCase()).not.toMatch(
        /(?:\b(?:hai|deli|detaile|masterp|illustra|dyn)\.|,\s*\.|\(\(\.)$/,
      )
      expect(en.toLowerCase()).not.toMatch(
        /(?:clothes lit|pants pull!|another's\.|squatting\. open legs)/,
      )
      expect(en.toLowerCase()).not.toMatch(
        /\b(?:badanatomy|belween|homs|horms|narrwed|relfection|losed|casselte|planls|tum|greenhair|foxears|airbangs|fundoshi|devileyes|collarbonea|canonicals|stile|torm|loating|bumt|fip|ormament|omament|foral|fullmoon|drinkingglass|mechanicalarms|longbody|withyellow|greenwaistband|redwith|blackwithblue|purplelong|greensongmo|cyanfloral|fingermails|umop-apisdn|buning|shou|ascil|cumulogentis|atfood|uppershan|whitegolden|withgreen)\b/,
      )
      expect(id).not.toMatch(
        /(?:umop-apisdn|buning|^shou$|sharp-fingermails|looking-atfood|pinkwilhblackuppershan)/,
      )
      expect(en).not.toMatch(/:\s*\d+(?:\.\d+)?|\(\([^)]|\)[,:]\s*\(?[a-z]/i)
      expect(en.trim()).not.toMatch(/^\([^)]*\)$/)
    }

    expect(builtinPrompts.find(({ id }) => id === '1980s-anime')?.zh).toBe('80 年代动画')
    expect(builtinPrompts.find(({ id }) => id === 'restrained-expression')).toMatchObject({
      zh: '克制的表情',
      en: 'restrained expression',
      category_id: 'expression-emotion',
    })
    expect(builtinPrompts.find(({ id }) => id === 'amputee')).toMatchObject({
      zh: '截肢者',
      category_id: 'people-subjects',
    })
    expect(builtinPrompts.find(({ id }) => id === 'ao-dai')?.zh).toBe('奥黛（越南传统服饰）')
    for (const oldId of [
      'camoflage',
      'altermate-headwear',
      'hormed-helmet',
      'altocumulus-strataformis',
      'altostratus-duplicates',
      'stratocumulus-cumulogentis',
      'moderm-europe',
    ]) {
      expect(
        builtinPrompts.some(({ id }) => id === oldId),
        oldId,
      ).toBe(false)
    }
    expect(builtinPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'camouflage', en: 'camouflage' }),
        expect.objectContaining({ id: 'alternate-headwear', en: 'alternate headwear' }),
        expect.objectContaining({ id: 'horned-helmet', en: 'horned helmet' }),
        expect.objectContaining({
          id: 'altostratus-duplicatus',
          en: 'altostratus duplicatus',
        }),
        expect.objectContaining({
          id: 'savory-pastries',
          zh: '咸味馅饼',
          en: 'savory pastries',
        }),
        expect.objectContaining({ id: 'clothes-writing', en: 'clothes writing' }),
        expect.objectContaining({ id: 'altocumulus-lenticularis', zh: '荚状高积云' }),
        expect.objectContaining({ id: 'copper', zh: '铜' }),
        expect.objectContaining({ id: 'against-glass', zh: '贴在玻璃上' }),
        expect.objectContaining({ id: 'green-floral-songmo', zh: '绿碎花宋抹' }),
        expect.objectContaining({
          id: 'gripping-a-bedsheet',
          zh: '紧握床单',
          en: 'gripping a bedsheet',
        }),
        expect.objectContaining({ id: 'adjusting-a-necktie', en: 'adjusting a necktie' }),
        expect.objectContaining({ id: 'adjusting-neckwear', en: 'adjusting neckwear' }),
        expect.objectContaining({ id: 'clutching-a-pillow', en: 'clutching a pillow' }),
        expect.objectContaining({ id: 'hanging-breasts', zh: '下垂乳房' }),
        expect.objectContaining({ id: 'bouncing-breasts', zh: '晃动的乳房' }),
        expect.objectContaining({ id: 'rappelling', zh: '绳降' }),
        expect.objectContaining({ id: 'one-piece-swimsuit', zh: '标准连体泳衣' }),
        expect.objectContaining({
          id: 'maebari-and-pasties',
          zh: '阴贴与乳贴',
          en: 'maebari and pasties',
        }),
        expect.objectContaining({ id: 'ascii-art', en: 'ASCII art' }),
        expect.objectContaining({
          id: 'autumn-maple-forest-path',
          zh: '秋日枫林小径',
          en: 'autumn maple forest path',
        }),
        expect.objectContaining({ id: 'skin', zh: '肌肤' }),
        expect.objectContaining({ id: 'buck-teeth', zh: '龅牙' }),
        expect.objectContaining({ id: 'hakama-pants', zh: '袴裤' }),
        expect.objectContaining({ id: 'open-jacket', zh: '敞开的夹克' }),
        expect.objectContaining({
          id: 'tiptoes',
          zh: '踮起脚尖',
          category_id: 'action-pose',
        }),
        expect.objectContaining({
          id: 'stubble',
          zh: '胡茬',
          category_id: 'people-subjects',
        }),
        expect.objectContaining({
          id: 'censorship-bar',
          zh: '审查遮挡条',
          en: 'censorship bar',
          category_id: 'quality-effects',
        }),
        expect.objectContaining({
          id: 'chibi-inset',
          zh: 'Q 版嵌图',
          category_id: 'visual-style',
        }),
        expect.objectContaining({ id: 'upside-down', en: 'upside-down' }),
        expect.objectContaining({ id: 'burning', en: 'burning' }),
        expect.objectContaining({ id: 'hand-behind-head', en: 'hand behind head' }),
        expect.objectContaining({ id: 'sharp-fingernails', en: 'sharp fingernails' }),
        expect.objectContaining({ id: 'looking-at-food', en: 'looking at food' }),
        expect.objectContaining({
          id: 'pink-and-black-upper-shan',
          en: 'pink and black upper shan',
        }),
        expect.objectContaining({ id: 'domino-mask', zh: '多米诺面具' }),

        expect.objectContaining({ id: 'diadem', zh: '王冠额饰' }),
        expect.objectContaining({ id: 'genshin-impact', zh: '原神' }),
        expect.objectContaining({
          id: 'koakuma',
          zh: '小恶魔',
          category_id: 'people-subjects',
        }),
        expect.objectContaining({ id: 'stirrup-legwear', zh: '踩脚袜' }),
        expect.objectContaining({ id: 'porkpie-hat', zh: '平顶窄檐帽' }),
        expect.objectContaining({ id: 'bokeh', zh: '散景' }),
        expect.objectContaining({ id: 'twintails', zh: '双马尾发型' }),
        expect.objectContaining({ id: 'two-tone-hair', zh: '双色头发' }),
        expect.objectContaining({ id: 'light-brown-hair', zh: '浅棕色头发' }),
        expect.objectContaining({ id: 'hair-pink-flowers', zh: '粉色发间花朵' }),
        expect.objectContaining({ id: 'anime-style-eyes', zh: '动漫风格眼睛' }),
        expect.objectContaining({ id: 'dixie-cup-hat', zh: '水兵帽' }),
        expect.objectContaining({ id: 'green-pleated-skirt', zh: '绿色百褶裙' }),
        expect.objectContaining({ id: 'blue-pleated-skirt', zh: '蓝色百褶裙' }),
        expect.objectContaining({ id: 'white-pleated-skirt', zh: '白色百褶裙' }),
        expect.objectContaining({ id: 'red-pleated-skirt', zh: '红色百褶裙' }),
        expect.objectContaining({ id: 'pink-pleated-skirt', zh: '粉色百褶裙' }),
        expect.objectContaining({ id: 'light-blue-pleated-skirt', zh: '浅蓝色百褶裙' }),
        expect.objectContaining({
          id: 'dragon-background',
          zh: '巨龙背景',
          en: 'dragon background',
        }),
        expect.objectContaining({
          id: 'greco-roman-architecture',
          zh: '希腊罗马建筑',
        }),
        expect.objectContaining({
          id: 'pink-and-black-long-upper-shan',
          zh: '粉黑长上杉',
        }),
        expect.objectContaining({
          id: 'black-and-blue-long-upper-shan',
          zh: '黑蓝长上杉',
        }),
        expect.objectContaining({
          id: 'light-purple-long-upper-shan',
          zh: '浅紫长上杉',
        }),
        expect.objectContaining({
          id: 'pursed-lips',
          zh: '抿嘴',
          en: 'pursed lips',
          category_id: 'expression-emotion',
        }),
        expect.objectContaining({ id: 'pantyhose', zh: '连裤袜' }),
        expect.objectContaining({ id: 'suspenders', zh: '背带' }),
        expect.objectContaining({ id: 'visor', zh: '遮阳板' }),
        expect.objectContaining({
          id: 'head-rest',
          zh: '托着头',
          category_id: 'action-pose',
        }),
        expect.objectContaining({ id: 'hat-removed', zh: '摘下帽子' }),
        expect.objectContaining({ id: 'snake-hair-ornament', zh: '蛇形发饰' }),
        expect.objectContaining({
          id: 'happy',
          zh: '快乐',
          category_id: 'expression-emotion',
        }),
        expect.objectContaining({
          id: 'wind-lift',
          zh: '上升气流',
          category_id: 'scene-environment',
        }),
        expect.objectContaining({
          id: 'pince-nez',
          zh: '夹鼻眼镜',
          category_id: 'clothing-accessories',
        }),
        expect.objectContaining({
          id: 'forehead-kiss',
          zh: '亲吻额头',
          category_id: 'action-pose',
        }),
      ]),
    )
  })

  it('does not import unresolved model-specific screenshot noise', () => {
    const searchable = builtinPrompts
      .flatMap(({ id, zh, en, aliases_zh, aliases_en }) => [
        id,
        zh,
        en,
        ...aliases_zh,
        ...aliases_en,
      ])
      .join('\n')
      .toLowerCase()
    for (const excluded of ['<lora:']) {
      expect(searchable).not.toContain(excluded)
    }
  })
})
