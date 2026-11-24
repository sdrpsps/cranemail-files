import { eq } from 'drizzle-orm'
import { db, users } from '../db'
import { resolveServerUrl } from '../smartermail-session'
import type { UserRow } from './types'

export function isTelegramUserAllowed(fromId: number, fromUsername?: string) {
  const allowedUsersStr = process.env.ALLOWED_TELEGRAM_USERS || ''
  const allowedUsers = allowedUsersStr ? allowedUsersStr.split(',').map(u => u.trim().toLowerCase()) : []
  if (allowedUsers.length === 0) {
    return true
  }

  return (
    allowedUsers.includes(String(fromId)) ||
    Boolean(fromUsername && allowedUsers.includes(fromUsername.toLowerCase()))
  )
}

export async function getTelegramBoundUser(fromId: number): Promise<UserRow | undefined> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      serverUrl: users.serverUrl,
      telegramUserId: users.telegramUserId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.telegramUserId, String(fromId)))
    .limit(1)

  if (!user || !user.email) {
    return undefined
  }

  return {
    id: user.id,
    email: user.email,
    serverUrl: resolveServerUrl(user.serverUrl ?? undefined),
    telegramUserId: user.telegramUserId,
    createdAt: user.createdAt ?? undefined,
    updatedAt: user.updatedAt ?? undefined,
  }
}
