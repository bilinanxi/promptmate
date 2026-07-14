import imagePromptJsonl from '../../../resources/builtin/prompts/image.jsonl?raw'
import { parsePromptJsonl } from './parsePromptJsonl'

export const builtinPrompts = parsePromptJsonl(imagePromptJsonl, 'image.jsonl')
