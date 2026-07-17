export function safeAiErrorMessage(error: unknown, fallback: string) {
  const message =
    typeof error === 'string' ? error : error instanceof Error ? error.message : fallback
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 300)
}
