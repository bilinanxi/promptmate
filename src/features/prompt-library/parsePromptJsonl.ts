import type { ErrorObject, ValidateFunction } from 'ajv'
import type { MediaType, PromptConcept } from './types'
import generatedValidateConcept from './validatePromptConcept.generated'

const validateConcept = generatedValidateConcept as ValidateFunction<PromptConcept>

function formatValidationError(error: ErrorObject): string {
  if (error.keyword === 'required') {
    return `missing required field "${error.params.missingProperty as string}"`
  }

  const field = error.instancePath.slice(1) || 'record'
  return `${field} ${error.message ?? 'is invalid'}`
}

export function parsePromptJsonl(
  content: string,
  fileName: string,
  requiredMediaType?: MediaType,
): PromptConcept[] {
  const idLines = new Map<string, number>()

  return content.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return []
    const lineNumber = index + 1

    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      throw new Error(`${fileName}:${lineNumber} contains invalid JSON`)
    }

    if (!validateConcept(record)) {
      const detail = formatValidationError(validateConcept.errors![0])
      throw new Error(`${fileName}:${lineNumber} is invalid: ${detail}`)
    }

    if (requiredMediaType && !record.media_types.includes(requiredMediaType)) {
      throw new Error(
        `${fileName}:${lineNumber} is invalid: media_types must include "${requiredMediaType}"`,
      )
    }

    const originalLine = idLines.get(record.id)
    if (originalLine) {
      throw new Error(
        `${fileName}:${lineNumber} duplicates id "${record.id}" from line ${originalLine}`,
      )
    }
    idLines.set(record.id, lineNumber)

    return [record]
  })
}
