import imagePromptJsonl from '../../../resources/builtin/prompts/image.jsonl?raw'
import videoPromptJsonl from '../../../resources/builtin/prompts/video.jsonl?raw'
import { parsePromptJsonl } from './parsePromptJsonl'
import type { MediaType } from './types'

export const builtinPromptsByMedia: Record<MediaType, ReturnType<typeof parsePromptJsonl>> = {
  image: parsePromptJsonl(imagePromptJsonl, 'image.jsonl', 'image'),
  video: parsePromptJsonl(videoPromptJsonl, 'video.jsonl', 'video'),
}

export const builtinPrompts = builtinPromptsByMedia.image
