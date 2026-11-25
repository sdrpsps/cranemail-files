import type { InlineKeyboardMarkup, ReplyKeyboardMarkup } from 'grammy/types'
import { getBotRuntime, getTelegramApi } from './runtime'

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const botMainMenu: ReplyKeyboardMarkup = {
  keyboard: [[{ text: '📂 My Files' }, { text: '👤 Accounts' }, { text: '❓ Help' }]],
  resize_keyboard: true,
  one_time_keyboard: false,
}

export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: InlineKeyboardMarkup | ReplyKeyboardMarkup) {
  return getTelegramApi().sendMessage(chatId, text, {
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

export async function editTelegramMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
) {
  return getTelegramApi().editMessageText(chatId, messageId, text, {
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

export async function answerTelegramCallbackQuery(callbackQueryId: string) {
  return getTelegramApi().answerCallbackQuery(callbackQueryId)
}

export async function getTelegramFilePath(fileId: string) {
  const file = await getTelegramApi().getFile(fileId)
  if (!file.file_path) throw new Error('Telegram did not return a file path.')
  return file.file_path
}

export async function downloadTelegramFile(filePath: string) {
  const { token } = getBotRuntime()
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
  if (!response.ok) throw new Error('Failed to download file from Telegram servers.')
  return Buffer.from(await response.arrayBuffer())
}
