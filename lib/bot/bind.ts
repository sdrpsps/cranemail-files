import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import { bindTokens, db, telegramBindings, telegramSelections, users } from '../db'
import { botMainMenu, escapeTelegramHtml, sendTelegramMessage } from './telegram-api'
import { getBotRuntime } from './runtime'

export async function handleStartCommand(chatId: number, fromId: number, text: string, updateId: number) {
  const token = text.trim().split(/\s+/)[1]
  if (!token) {
    await sendTelegramMessage(chatId,
      '👋 <b>CraneMail Files</b>\n\nSign in on the website, open <b>Telegram Bots</b>, select this bot, and generate a binding link. You can link several CraneMail accounts without removing existing accounts.\n\nUse /accounts to choose the account for uploads and /files to list its files.', botMainMenu)
    return
  }

  const botId = getBotRuntime().id
  const telegramUserId = String(fromId)
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

  if (!account?.email) {
    const reason = account && account.updateId !== null
      ? 'This binding link has expired.'
      : 'Invalid or expired token, or this link belongs to another bot.'
    await sendTelegramMessage(chatId,
      `❌ <b>Binding Failed:</b>\n${reason} Generate a new link on the website.`)
    return
  }
  await sendTelegramMessage(chatId,
    `🎉 <b>Account linked:</b> <code>${escapeTelegramHtml(account.email)}</code>\n\nExisting accounts are still linked. Use /accounts to select the account for uploads.`, botMainMenu)
}
