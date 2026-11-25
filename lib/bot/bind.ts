import { getDb } from '../db'
import { redeemTelegramBindToken } from './redeem-bind-token'
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
  const account = await redeemTelegramBindToken(getDb(), token, botId, telegramUserId, updateId)

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
