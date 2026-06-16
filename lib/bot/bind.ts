import { db } from '../db'
import { botMainMenu, sendTelegramMessage } from './telegram-api'
import type { BindTokenRow } from './types'

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
    const bindResult = await db.execute({
      sql: 'SELECT * FROM bind_tokens WHERE token = ? LIMIT 1',
      args: [token],
    })
    const bindToken = bindResult.rows[0] as unknown as BindTokenRow | undefined

    if (!bindToken || new Date(bindToken.expiresAt) < new Date()) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>Binding Failed:</b>\nInvalid or expired binding token. Please go back to the web dashboard and generate a new link.'
      )
      return
    }

    const userCheck = await db.execute({
      sql: 'SELECT id, email FROM users WHERE id = ? LIMIT 1',
      args: [bindToken.userId],
    })
    const existingUser = userCheck.rows[0] as { id?: string; email?: string } | undefined

    if (!existingUser?.id || !existingUser.email) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>Binding Failed:</b>\nThe linked web session no longer exists. Please generate a new binding link.'
      )
      return
    }

    const userId = String(existingUser.id)

    await db.execute({
      sql: 'UPDATE users SET telegramUserId = NULL, updatedAt = CURRENT_TIMESTAMP WHERE telegramUserId = ? AND id <> ?',
      args: [String(fromId), userId],
    })

    await db.execute({
      sql: 'UPDATE users SET telegramUserId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      args: [String(fromId), userId],
    })

    await db.execute({
      sql: 'DELETE FROM bind_tokens WHERE token = ?',
      args: [token],
    })

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
