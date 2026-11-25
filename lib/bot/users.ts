import { and, eq } from 'drizzle-orm'
import { db, telegramBindings, telegramSelections, users } from '../db'
import { resolveServerUrl } from '../smartermail-session'
import { getBotRuntime } from './runtime'
import type { UserRow } from './types'

export async function getTelegramAccounts(fromId: number): Promise<UserRow[]> {
  const botId = getBotRuntime().id
  const rows = await db.select({ user: users }).from(telegramBindings)
    .innerJoin(users, eq(users.id, telegramBindings.userId))
    .where(and(eq(telegramBindings.botId, botId), eq(telegramBindings.telegramUserId, String(fromId))))
    .orderBy(telegramBindings.createdAt, users.email)

  return rows.filter(({ user }) => user.email).map(({ user }) => ({
    id: user.id,
    email: user.email!,
    serverUrl: resolveServerUrl(user.serverUrl ?? undefined),
    createdAt: user.createdAt ?? undefined,
    updatedAt: user.updatedAt ?? undefined,
  }))
}

export async function getTelegramBoundUser(fromId: number): Promise<UserRow | undefined> {
  const accounts = await getTelegramAccounts(fromId)
  const [selection] = await db.select().from(telegramSelections)
    .where(and(
      eq(telegramSelections.botId, getBotRuntime().id),
      eq(telegramSelections.telegramUserId, String(fromId)),
    ))
  if (selection) return accounts.find((account) => account.id === selection.userId)
  return accounts.length === 1 ? accounts[0] : undefined
}

export async function selectTelegramAccount(fromId: number, userId: string) {
  const account = (await getTelegramAccounts(fromId)).find((user) => user.id === userId)
  if (!account) return undefined
  await db.insert(telegramSelections).values({
    botId: getBotRuntime().id, telegramUserId: String(fromId), userId,
  }).onConflictDoUpdate({
    target: [telegramSelections.botId, telegramSelections.telegramUserId], set: { userId },
  })
  return account
}

export async function isUserTelegramBound(userId: string) {
  const [binding] = await db.select({ userId: telegramBindings.userId }).from(telegramBindings)
    .where(eq(telegramBindings.userId, userId)).limit(1)
  return Boolean(binding)
}
