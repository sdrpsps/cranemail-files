import { and, eq, isNull } from 'drizzle-orm'

import { db, uploadedFiles, users } from './db'
import { getPublicUrl } from './format'
import { isValidShortCode, withShortCodeRetry } from './shortlink-code'

export { generateShortCode, isValidShortCode } from './shortlink-code'

export function buildShortUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/s/${code}`
}

export async function assignShortCode(recordId: string): Promise<string | null> {
  await withShortCodeRetry((shortCode) => db
    .update(uploadedFiles)
    .set({ shortCode })
    .where(and(eq(uploadedFiles.id, recordId), isNull(uploadedFiles.shortCode))))

  // Concurrent callers may already have assigned a code; always return the stored one.
  const [file] = await db
    .select({ shortCode: uploadedFiles.shortCode })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.id, recordId))
    .limit(1)
  return file?.shortCode ?? null
}

export async function insertFileWithShortCode(
  file: Omit<typeof uploadedFiles.$inferInsert, 'shortCode'>,
): Promise<string> {
  const { shortCode } = await withShortCodeRetry((code) => db
    .insert(uploadedFiles)
    .values({ ...file, shortCode: code }))
  return shortCode
}

export async function resolveShortCode(code: string): Promise<string | null> {
  if (!isValidShortCode(code)) return null

  const [file] = await db
    .select({ publicLink: uploadedFiles.publicLink, serverUrl: users.serverUrl })
    .from(uploadedFiles)
    .leftJoin(users, eq(uploadedFiles.email, users.email))
    .where(eq(uploadedFiles.shortCode, code))
    .limit(1)
  if (!file?.publicLink) return null

  // Legacy records can contain relative links from a user's custom mail server.
  return getPublicUrl(file.publicLink, file.serverUrl || undefined)
}
