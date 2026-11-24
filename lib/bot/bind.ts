import { and, eq, ne, sql } from 'drizzle-orm'
import { bindTokens, db, users } from '../db'
import { botMainMenu, sendTelegramMessage } from './telegram-api'

export function isStartCommand(text?: string) {
  return Boolean(text?.startsWith('/start'))
}

export async function handleStartCommand(chatId: number, fromId: number, text: string) {
  const args = text.split(' ')
  if (args.length < 2) {
    await sendTelegramMessage(
      chatId,
      `👋 <b>Welcome to CraneMail File Share!</b>\n\nTo upload files to your SmarterMail cloud storage using this bot, please link your account:\n\n1. Open our website in your browser.\n2. Sign in to your mail account.\n3. Click <b>"Link Telegram Bot"</b> to generate a binding link.\n\nOnce linked, any photo or document you send here will be uploaded and a public sharing link will be generated.`,
      botMainMenu
    )
    return
  }

  const token = args[1].trim()
  try {
    const [bindToken] = await db
      .select()
      .from(bindTokens)
      .where(eq(bindTokens.token, token))
      .limit(1)

    if (!bindToken || !bindToken.expiresAt || new Date(bindToken.expiresAt) < new Date()) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>Binding Failed:</b>\nInvalid or expired binding token. Please go back to the web dashboard and generate a new link.'
      )
      return
    }

    const [existingUser] = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, bindToken.userId))
      .limit(1)

    if (!existingUser || !existingUser.email) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>Binding Failed:</b>\nThe linked web session no longer exists. Please generate a new binding link.'
      )
      return
    }

    const userId = existingUser.id

    await db
      .update(users)
      .set({
        telegramUserId: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(users.telegramUserId, String(fromId)), ne(users.id, userId)))

    await db
      .update(users)
      .set({
        telegramUserId: String(fromId),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, userId))

    await db.delete(bindTokens).where(eq(bindTokens.token, token))

    await sendTelegramMessage(
      chatId,
      `🎉 <b>Binding Successful!</b>\n\nYour Telegram account has been linked to CraneMail account: <code>${existingUser.email}</code>.\n\nYou can now send files to this bot, and they will be uploaded directly to your cloud drive!`,
      botMainMenu
    )
  } catch (err) {
    console.error('Error binding account:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    await sendTelegramMessage(chatId, `❌ <b>Binding Error:</b>\nAn error occurred while linking your account: ${errorMessage}`)
  }
}
