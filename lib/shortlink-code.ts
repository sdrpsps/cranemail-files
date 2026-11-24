import { randomInt } from 'node:crypto'

const CODE_LENGTH = 7
const CODE_SPACE = 36 ** CODE_LENGTH
const MAX_ATTEMPTS = 5

export function generateShortCode(): string {
  return randomInt(CODE_SPACE).toString(36).padStart(CODE_LENGTH, '0')
}

export function isValidShortCode(code: string): boolean {
  // Keep accepting uppercase characters in existing base62 codes.
  return code.length === CODE_LENGTH && /^[0-9A-Za-z]{7}$/.test(code)
}

function isShortCodeCollision(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /UNIQUE constraint failed: uploaded_files\.shortCode\b/i.test(error.message)
    || isShortCodeCollision(error.cause)
}

export async function withShortCodeRetry<T>(
  write: (code: string) => PromiseLike<T>,
): Promise<{ shortCode: string; result: T }> {
  for (let attempt = 1; ; attempt++) {
    const shortCode = generateShortCode()
    try {
      return { shortCode, result: await write(shortCode) }
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isShortCodeCollision(error)) throw error
    }
  }
}
