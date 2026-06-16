import { db } from '../db'
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

export async function getTelegramBoundUser(fromId: number) {
  const userRes = await db.execute({
    sql: 'SELECT * FROM users WHERE telegramUserId = ? LIMIT 1',
    args: [String(fromId)],
  })

  return userRes.rows[0] as unknown as UserRow | undefined
}
