import { and, eq, gt } from 'drizzle-orm'
import { bindTokens, db, telegramBindings, telegramSelections, users } from '../db'
import { botMainMenu, escapeTelegramHtml, sendTelegramMessage } from './telegram-api'
import { getBotRuntime } from './runtime'

export async function handleStartCommand(chatId: number, fromId: number, text: string) {
  const token = text.trim().split(/\s+/)[1]
  if (!token) {
    await sendTelegramMessage(chatId,
      '👋 <b>CraneMail Files</b>\n\nSign in on the website, open <b>Telegram Bots</b>, select this bot, and generate a binding link. You can link several CraneMail accounts without removing existing accounts.\n\nUse /accounts to choose the account for uploads and /files to list its files.', botMainMenu)
    return
  }

  const botId = getBotRuntime().id
  const account = await db.transaction(async (tx) => {
    // Consume the token atomically, on the intended bot only.
    const [binding] = await tx.delete(bindTokens).where(and(
      eq(bindTokens.token, token), eq(bindTokens.botId, botId),
      gt(bindTokens.expiresAt, new Date().toISOString()),
    )).returning()
    if (!binding) return undefined
    const [user] = await tx.select().from(users).where(eq(users.id, binding.userId)).limit(1)
    if (!user?.email) return undefined
    await tx.insert(telegramBindings).values({
      botId, telegramUserId: String(fromId), userId: user.id,
    }).onConflictDoNothing()
    // Adding another account never silently changes the upload destination.
    await tx.insert(telegramSelections).values({
      botId, telegramUserId: String(fromId), userId: user.id,
    }).onConflictDoNothing()
    return user
  })

  if (!account) {
    await sendTelegramMessage(chatId,
      '❌ <b>Binding Failed:</b>\nInvalid or expired token, or this link belongs to another bot. Generate a new link on the website.')
    return
  }
  await sendTelegramMessage(chatId,
    `🎉 <b>Account linked:</b> <code>${escapeTelegramHtml(account.email!)}</code>\n\nExisting accounts are still linked. Use /accounts to select the account for uploads.`, botMainMenu)
}
