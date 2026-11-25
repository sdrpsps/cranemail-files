import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { CraneMailD1Database } from '../db/d1'
import * as schema from '../db/schema'

const { bindTokens, telegramBindings, telegramSelections, users } = schema
type BindDatabase = Pick<BaseSQLiteDatabase<'async', unknown, typeof schema>, 'select' | 'insert' | 'update'>
  & Pick<CraneMailD1Database, 'batch'>

export async function redeemTelegramBindToken(
  db: BindDatabase,
  token: string,
  botId: string,
  telegramUserId: string,
  updateId: number,
) {
  const tokenForBot = and(eq(bindTokens.token, token), eq(bindTokens.botId, botId))
  const redeemedByUpdate = and(tokenForBot,
    eq(bindTokens.redeemedTelegramUserId, telegramUserId), eq(bindTokens.redeemedUpdateId, updateId))
  const accountWithEmail = and(eq(users.id, bindTokens.userId), ne(users.email, ''))
  const bindingFields = {
    botId: bindTokens.botId,
    telegramUserId: bindTokens.redeemedTelegramUserId,
    userId: bindTokens.userId,
  }
  const [, , , [account]] = await db.batch([
    db.update(bindTokens).set({ redeemedTelegramUserId: telegramUserId, redeemedUpdateId: updateId })
      .where(and(tokenForBot, isNull(bindTokens.redeemedTelegramUserId), gt(bindTokens.expiresAt, new Date().toISOString()))),
    db.insert(telegramBindings).select(
      db.select({ ...bindingFields, createdAt: sql`CURRENT_TIMESTAMP`.as('createdAt') }).from(bindTokens)
        .innerJoin(users, accountWithEmail).where(redeemedByUpdate),
    ).onConflictDoNothing(),
    db.insert(telegramSelections).select(
      db.select(bindingFields).from(bindTokens).innerJoin(users, accountWithEmail).where(redeemedByUpdate),
    ).onConflictDoNothing(),
    db.select({ email: users.email, updateId: bindTokens.redeemedUpdateId }).from(bindTokens)
      .leftJoin(users, and(accountWithEmail, redeemedByUpdate)).where(tokenForBot),
  ])
  return account
}
